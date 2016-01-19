/**
 * TODO: Document
 * @module lib/models/apis/docker
 */
'use strict'

var async = require('async')
var bluebird = require('bluebird')
var Boom = require('dat-middleware').Boom
var createStreamCleanser = require('docker-stream-cleanser')
var defaults = require('101/defaults')
var Dockerode = require('dockerode')
var dogerode = require('dogerode')
var extend = require('101/assign')
var fs = require('fs')
var isFunction = require('101/is-function')
var isObject = require('101/is-object')
var join = require('path').join
var JSONStream = require('JSONStream')
var keypather = require('keypather')()
var map = require('object-loops/map')
var once = require('once')
var pick = require('101/pick')
var put = require('101/put')
var url = require('url')

var error = require('error')
var flattenMongooseDoc = require('utils/flatten-mongoose-doc')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var monitor = require('monitor-dog')
var reverseFind = require('utils/reverse-find')
var toJSON = require('utils/to-json')
var utils = require('middlewares/utils')

var log = logger.log

// try/catch is a better pattern for this, since checking to see if it exists
// and then reading files can lead to race conditions (unlikely, but still)
var certs = {}
try {
  // DOCKER_CERT_PATH is docker's default thing it checks - may as well use it
  var certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker'
  certs.ca = fs.readFileSync(join(certPath, '/ca.pem'))
  certs.cert = fs.readFileSync(join(certPath, '/cert.pem'))
  certs.key = fs.readFileSync(join(certPath, '/key.pem'))
} catch (e) {
  log.warn({ err: e }, 'cannot load certificates for docker!!')
  // use all or none - so reset certs here
  certs = {}
}

module.exports = Docker

/**
 * @param {Object} opts - docker options
 */
function Docker (opts) {
  opts = defaults(opts, {
    host: process.env.SWARM_HOST
  })
  var dockerHost = opts.host
  this.logData = {
    tx: true,
    dockerHost: dockerHost,
    opts: opts
  }
  log.info(this.logData, 'Docker constructor')

  var parsed = url.parse(dockerHost)
  this.dockerHost = parsed.protocol + '//' + parsed.host
  this.port = parsed.port
  var dockerodeOpts = defaults(opts, {
    host: this.dockerHost,
    port: this.port,
    timeout: process.env.API_DOCKER_TIMEOUT
  })
  extend(dockerodeOpts, certs)
  this.docker = dogerode(new Dockerode(dockerodeOpts), {
    service: 'api',
    host: process.env.DATADOG_HOST,
    port: process.env.DATADOG_PORT
  })
}

/**
 * get docker tag url
 * @param  {object} version     version mongo model
 * @return {string}             dockerUrl
 */
Docker.getDockerTag = function (version) {
  return join(
    process.env.REGISTRY_DOMAIN + '/',
    version.owner.github.toString(),
    version.context + ':' + version._id)
}

/**
 * check if an error is an "image not found" create container error
 * @return {Boolean}
 */
Docker.isImageNotFoundForCreateErr = function (err) {
  if (!err) { return false }
  // unwrap if wrapped
  if (err.data && err.data.err) {
    err = err.data.err
  }
  // note: dockerode incorrectly describes this error
  //   as "no such container" bc it is wrong in the
  //   docker docs:
  //   https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21#create-a-container
  //   I have future-proofed this to match "no such image"
  return Boolean(
    err.statusCode === 404 &&
    err.reason &&
    /no such (container|image)/.test(err.reason)
  )
}

/**
 * check if an error is an "image not found" for pull container error
 * @return {Boolean}
 */
Docker.isImageNotFoundForPullErr = function (err) {
  if (!err) { return false }
  return Boolean(
    err.isBoom &&
    err.output.statusCode === 404 &&
    /image.*not found/.test(err.message)
  )
}

/**
 * @param {Object} opts
 * @param {Boolean} opts.manualBuild - Boolean indicating automatic or manual build
 * @param {Object} opts.sessionUser - Currently authenticated user
 * @param {Object} opts.ownerUsername - Cvs owner's github username
 * @param {Object} opts.contextVersion - contextVersion to be built
 * @param {Boolean} opts.noCache -
 * @param {String} opts.tid - TID value to place on labels
 */
Docker.prototype.createImageBuilder = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  }
  log.info(logData, 'Docker.prototype.createImageBuilder')
  var validationError = this._createImageBuilderValidateCV(opts.contextVersion)
  if (validationError) {
    return cb(validationError)
  }
  var self = this

  var dockerTag = Docker.getDockerTag(opts.contextVersion)
  var buildContainerLabels = this._createImageBuilderLabels({
    contextVersion: opts.contextVersion,
    dockerTag: dockerTag,
    manualBuild: opts.manualBuild,
    network: opts.network,
    noCache: opts.noCache,
    sessionUser: opts.sessionUser,
    ownerUsername: opts.ownerUsername,
    tid: opts.tid
  })
  var builderContainerData = {
    Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
    Env: this._createImageBuilderEnv({
      dockerTag: dockerTag,
      noCache: opts.noCache,
      contextVersion: opts.contextVersion
    }),
    HostConfig: {
      Binds: []
    },
    Labels: buildContainerLabels
  }

  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    builderContainerData.HostConfig.Binds.push(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw')
  }

  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    builderContainerData.HostConfig.Binds.push(process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw')
  }

  self.createContainer(builderContainerData, function (err, container) {
    if (err) {
      log.error(put({err: err}, logData), 'createImageBuilder createContainer failed')
      return self._handleCreateContainerError(err, builderContainerData, cb)
    }
    log.trace(put({container: container}, logData), 'createImageBuilder createContainer success')

    cb(null, container)
  })
}

/**
 * handles constraint errors from create container
 * if we do not have resources, drop that requirement
 * cb with err if none of the above
 * @param  {Object}   err  returned error from dockerode
 * @param  {Object}   opts used for creating container
 * @param  {Function} cb   (err, container)
 */
Docker.prototype._handleCreateContainerError = function (err, opts, cb) {
  var logData = {
    tx: true,
    err: err,
    opts: opts
  }
  log.info(logData, 'Docker.prototype._handleCreateContainerError')

  if (Docker._isConstraintFailure(err)) {
    keypather.set(err, 'data.level', 'critical')
    log.error(put(logData, { org: opts.Labels['com.docker.swarm.constraints'] }), '_handleCreateContainerError unable to find dock for org')
    monitor.event({
      title: 'No dock created for org: ' + opts.Labels['com.docker.swarm.constraints'],
      text: 'No dock create for org info: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
    // Report error to Rollbar
    error.log(err)
    return cb(err)
  }

  if (Docker._isOutOfResources(err)) {
    // report critical error to rollbar so we can trigger pagerduty for now
    keypather.set(err, 'data.level', 'critical')
    log.error(put(logData, {
      err: err,
      Memory: opts.Memory
    }), '_handleCreateContainerError unable to find dock with required resources')
    monitor.event({
      title: 'out of dock resources for org: ' + opts.Labels['com.docker.swarm.constraints'],
      text: 'out of resources info: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
    error.log(err, 'out of dock resources')
    return cb(err)
  }

  cb(err)
}

/**
 * checks error for a constraint failure
 * @param  {Object}  err from dockerode
 * @return {Boolean}     true if we did not meet constraints
 */
Docker._isConstraintFailure = function (err) {
  return !!~err.message.indexOf('unable to find a node that satisfies')
}

/**
 * checks error for out of resources failure
 * @param  {Object}  err from dockerode
 * @return {Boolean}     true if out of resources error
 */
Docker._isOutOfResources = function (err) {
  return !!~err.message.indexOf('no resources available to schedule')
}

/**
 * Image not found errors are expected to occur as swarm will retry several times before an image
 * is realized to be on a server. We detect this error to report to rollbar at a lower level than
 * error
 * @param {Object} err
 * @return Boolean
 */
Docker._isImageNotFoundErr = function (err) {
  // matches
  // "image 157693/558dae5e7562460d0024f5a8:5668ccbacdab6c1e0054a780 not found"
  return err.statusCode === 500 && /image \S+\:\S+ not found/.test(err.message)
}

/**
 * creates docker label for swarm constraints
 * should be string of form: '["name==value","name==~value"]'
 * @param  {Object[]} constraintsArray array of object constrains.
 * @param  {String} constraintsArray[].name name of constraint
 * @param  {String} constraintsArray[].type (hard/soft)
 *                                          hard constraints have to be meet
 *                                          soft constraints are just suggestions
 * @param  {String} constraintsArray[].value value to check for
 * @return {String} properly formated label
 */
Docker.createSwarmConstraints = function (constraintsArray) {
  var constrains = constraintsArray.map(function (constraint) {
    var operator = constraint.type === 'hard' ? '==' : '==~'
    return '"' + constraint.name + operator + constraint.value + '"'
  })

  return '[' + constrains.join(',') + ']'
}

/**
 * Validate ContextVersion should be built
 * @param {Object} contextVersion
 * @return {Object || null}
 */
Docker.prototype._createImageBuilderValidateCV = function (contextVersion) {
  var logData = { tx: true, contextVersion: contextVersion }
  log.info(logData, 'Docker.prototype._createImageBuilderValidateCV')
  if (contextVersion.build.completed) {
    log.error(logData, '_createImageBuilderValidateCV build completed')
    return Boom.conflict('Version already built', contextVersion)
  }
  if (!contextVersion.infraCodeVersion) {
    log.error(logData, '_createImageBuilderValidateCV no icv')
    return Boom.badRequest('Cannot build a version without a Dockerfile', contextVersion)
  }
  if (utils.isObjectId(contextVersion.infraCodeVersion)) {
    log.error(logData, '_createImageBuilderValidateCV not populated icv')
    return Boom.badRequest('Populate infraCodeVersion before building it', contextVersion)
  }
}

/**
 * Create labels hash for image builder container
 * @param {Object} opts.contextVersion
 * @param {String} opts.dockerTag
 * @param {Boolean} opts.manualBuild
 * @param {Boolean} opts.noCache
 * @param {Object} opts.sessionUser
 * @param {String} opts.tid
 * @return {Object} image builder container labels
 */
Docker.prototype._createImageBuilderLabels = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderLabels')
  var cvJSON = toJSON(opts.contextVersion)
  var flatContextVersion = flattenMongooseDoc(cvJSON, 'contextVersion')
  var labels = extend(flatContextVersion, {
    dockerTag: opts.dockerTag,
    manualBuild: opts.manualBuild,
    noCache: opts.noCache,
    sessionUserDisplayName: opts.sessionUser.accounts.github.displayName,
    sessionUserGithubId: opts.sessionUser.accounts.github.id,
    sessionUserUsername: opts.sessionUser.accounts.github.username,
    ownerUsername: opts.ownerUsername,
    tid: opts.tid,
    // Swarm affinities format:  'com.docker.swarm.affinities=["container==redis","image==nginx"]'
    // Swarm constraints format: 'com.docker.swarm.constraints=["region==us-east","storage==ssd"]'
    'com.docker.swarm.constraints': Docker.createSwarmConstraints([{
      name: 'org',
      value: cvJSON.owner.github,
      type: 'hard'
    }]),
    type: 'image-builder-container'
  })
  // all labels must be strings
  labels = map(labels, function (val) {
    return val + ''
  })
  log.trace(put({
    labels: labels
  }, this.logData), '_createImageBuilderLabels labels')
  return labels
}

/**
 * Get environment variables for image-builder container run
 * @return {array} env strings
 */
Docker.prototype._createImageBuilderEnv = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderEnv')
  var contextVersion = opts.contextVersion
  var dockerTag = opts.dockerTag

  var infraCodeVersion = contextVersion.infraCodeVersion
  var bucket = infraCodeVersion.bucket()
  var indexedVersions = {}
  infraCodeVersion.files.forEach(function (file) {
    indexedVersions[file.Key] = file.VersionId
  })
  var env = [
    'RUNNABLE_AWS_ACCESS_KEY=' + process.env.AWS_ACCESS_KEY_ID,
    'RUNNABLE_AWS_SECRET_KEY=' + process.env.AWS_SECRET_ACCESS_KEY,
    'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
    'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/'),
    'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
    'RUNNABLE_DOCKER=' + 'unix:///var/run/docker.sock',
    'RUNNABLE_DOCKERTAG=' + dockerTag,
    'RUNNABLE_IMAGE_BUILDER_NAME=' + process.env.DOCKER_IMAGE_BUILDER_NAME,
    'RUNNABLE_IMAGE_BUILDER_TAG=' + process.env.DOCKER_IMAGE_BUILDER_VERSION
  ]

  var repoUrls = []
  var commitishs = []
  var deployKeys = []
  contextVersion.appCodeVersions.forEach(function (acv) {
    repoUrls.push('git@github.com:' + acv.repo)
    // use either a commit, branch, or default to master
    commitishs.push(acv.commit || acv.branch || 'master')
    if (acv.privateKey) {
      deployKeys.push(acv.privateKey)
    }
  })
  env.push('RUNNABLE_REPO=' + repoUrls.join(';'))
  env.push('RUNNABLE_COMMITISH=' + commitishs.join(';'))
  env.push('RUNNABLE_KEYS_BUCKET=' + process.env.GITHUB_DEPLOY_KEYS_BUCKET)
  env.push('RUNNABLE_DEPLOYKEY=' + deployKeys.join(';'))

  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    env.push('DOCKER_IMAGE_BUILDER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_CACHE)
  }
  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    env.push('DOCKER_IMAGE_BUILDER_LAYER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE)
  }

  // need because we modify Dockefile with wait for weave command
  env.push('RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE)

  // pass in the NODE_ENV
  env.push('NODE_ENV=' + process.env.NODE_ENV)

  // build cpu limit
  var buildOpts = {
    Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES,
    forcerm: true
  }
  if (opts.noCache === true) {
    buildOpts.nocache = true
  }
  env.push('RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts))
  env.push('RUNNABLE_PUSH_IMAGE=true')

  return env
}

/**
 * Start the image builder container and wait for it's logs
 * @param {String} containerId - image-builder container (dockerode) or containerId
 * @param {Function} cb - callback(err, container, stream)
 */
// FIXME: error handling
var successRe = /Successfully built ([a-f0-9]+)/
Docker.prototype.startImageBuilderContainer = function (containerId, cb) {
  log.info({
    tx: true,
    containerId: containerId
  }, 'Docker.prototype.startImageBuilderContainer')
  var binds = [
    '/var/run/docker.sock:/var/run/docker.sock'
  ]

  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    binds.push(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw')
  }

  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    binds.push(process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw')
  }

  var startContainerData = {
    HostConfig: {
      Binds: binds
    }
  }
  this.startContainer(containerId, startContainerData, cb)
}

/**
 * should return all build info. logs, tag,
 * @param {String} containerId
 * @param {Number} exitCode image builder container exit code
 * @param {Function} cb
 */
Docker.prototype.getBuildInfo = function (containerId, exitCode, cb) {
  var logData = {
    tx: true,
    containerId: containerId,
    exitCode: exitCode
  }
  log.info(logData, 'Docker.prototype.getBuildInfo')
  var self = this
  // prevent multiple callbacks
  cb = once(cb)
  // get container logs stream
  var container = this.docker.getContainer(containerId)
  container.logs({
    follow: false,
    stdout: true,
    stderr: true
  }, function (err, stream) {
    log.trace(put({err: err}, logData), 'getBuildInfo build logs received')
    var errDebug = { containerId: containerId }
    if (err) {
      log.error(put({err: err}, logData), 'getBuildInfo error')
      return self.handleErr(cb, 'docker logs failed', errDebug)(err)
    }
    // create stream
    var streamCleanser = createStreamCleanser()
    var jsonParser = JSONStream.parse()
    log.info(logData, 'getBuildInfo: begin pipe job')
    var logArr = []
    // handle errors
    stream.on('error', self.handleErr(cb, 'docker logs stream failed', errDebug))
    streamCleanser.on('error', self.handleErr(cb, 'docker stream cleanser failed', errDebug))
    jsonParser.on('error', self.handleErr(cb, 'json parse failed to read build logs', errDebug))
    // pipe
    stream
      .pipe(streamCleanser)
      .pipe(jsonParser)
      .on('root', handleJSON) // json parser events
      .on('end', handleEnd)
    // success handlers
    function handleJSON (data) {
      var json = isObject(data) ? data : {}
      logArr.push(json)
    }
    function handleEnd () {
      logger.log.trace(logData, 'build logs cleansed')
      var dockerImage
      var buildSuccess = (exitCode === 0)
      if (buildSuccess) {
        // no need to look for imageId if buildFailed
        reverseFind(logArr, function (logItem) {
          var match = successRe.exec(logItem.content)
          dockerImage = match && match[1]
          return dockerImage
        })
      }
      cb(null, {
        failed: !buildSuccess,
        dockerImage: dockerImage,
        log: logArr
      })
    }
  })
}

/**
 * This function fetches a container, queries Docker for it's logs, and sends them to the supplied
 * callback
 * @param {String} containerId Id of the container to grab logs from
 * @param {String} tail count
 * @param {Function} cb Callback to send the log stream back to
 */
Docker.prototype.getLogs = function (containerId, tail, cb) {
  if (typeof tail === 'function') {
    cb = tail
    tail = 'all'
  }
  var logData = {
    tx: true,
    containerId: containerId,
    tail: tail
  }
  log.info(logData, 'Docker.prototype.getLogs')
  var self = this
  var container = this.docker.getContainer(containerId)
  if (!container) {
    log.error(logData, 'getLogs error, container not created')
    return cb(new Error('The requested container has not been created'))
  }
  // With the container, we can request the logs
  // TODO: add max length of log lines to tail
  container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: tail
  }, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'getLogs: error')
    } else {
      log.trace(logData, 'getLogs: success')
    }
    self.handleErr(cb, 'Get logs  failed',
      { containerId: containerId }).apply(this, arguments)
  })
}

/**
 * creates a user container
 * @param version: version object which contains build
 * @param opts:    opts to pass to docker
 * @param cb: Callback
 */

/**
 * create a user container for an instance
 * @param  {Object}   opts
 * @param  {Object}   opts.contextVersion completed contextVersion to create a container from
 * @param  {Object}   opts.instance instance for which the container is being created
 * @param  {Object}   opts.ownerUsername instance/contextVersion's owner's username
 * @param  {Function} cb   callback
 */
Docker.prototype.createUserContainer = function (opts, cb) {
  log.info({
    tx: true,
    opts: opts
  }, 'Docker.prototype.createUserContainer')
  var self = this
  // validate opts
  joi.validateOrBoom(map(opts, toJSON), joi.object({
    instance: joi.object({
      shortHash: joi.string().required()
    }).unknown().required(),
    contextVersion: joi.object().required(),
    ownerUsername: joi.string().required(),
    sessionUserGithubId: joi.any().required()
  }).unknown().required(), function (err) {
    if (err) { return cb(err) }
    var cv = opts.contextVersion
    var instance = opts.instance
    // validate cv is built
    if (!keypather.get(cv, 'build.dockerTag')) {
      err = Boom.badRequest('Cannot create a container for an unbuilt version', {
        contextVersionId: cv._id.toString(),
        completed: cv.build.completed,
        dockerTag: cv.build.dockerTag
      })
      return cb(err)
    }
    // validate instance has env
    if (!instance.env) {
      err = Boom.badRequest('opts.instance.env is required', {
        instanceId: instance._id.toString()
      })
      return cb(err)
    }
    // container envs
    var env = instance.env.concat([
      'RUNNABLE_CONTAINER_ID=' + instance.shortHash
    ])

    // create container
    self._createUserContainerLabels(opts, function (err, labels) {
      if (err) { return cb(err) }
      var userContainerData = {
        Labels: labels,
        // limit memory for container
        HostConfig: {
          Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES
        },
        Env: env,
        Image: cv.build.dockerTag
      }

      self.createContainer(userContainerData, function (err, container) {
        if (err) {
          log.error(put({ err: err }, userContainerData), 'createUserContainer createContainer failed')
          return self._handleCreateContainerError(err, userContainerData, cb)
        }

        log.trace(put({ container: container }, userContainerData), 'createUserContainer createContainer success')
        cb(null, container)
      })
    })
  })
}

/**
 * Create labels hash for instance container
 * @param  {Object} opts.contextVersion
 * @param  {Object} opts.instance
 * @param  {Object} opts.sessionUser
 * @param  {String} opts.ownerUsername
 * @param  {String} opts.deploymentUuid
 * @param  {Function} callback(err, labels) (sync)
 */
Docker.prototype._createUserContainerLabels = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts,
    elapsedTimeSeconds: new Date()
  }
  log.info(this.logData, 'Docker.prototype._createUserContainerLabels')
  joi.validateOrBoom(map(opts, toJSON), joi.object({
    instance: joi.object({
      _id: joi.objectId().required(),
      name: joi.string().required(),
      shortHash: joi.string().required()
    }).unknown().required(),
    contextVersion: joi.object({
      _id: joi.objectId().required(),
      owner: joi.object({
        github: joi.number().required()
      }).required()
    }).unknown().required(),
    sessionUserGithubId: joi.any().required(),
    ownerUsername: joi.string().required()
  }).unknown().required(), function (err) {
    if (err) { return cb(err) }

    var instance = toJSON(opts.instance)
    var cv = toJSON(opts.contextVersion)
    var constraints = [{
      name: 'org',
      value: cv.owner.github,
      type: 'hard'
    }]

    if (cv.dockerHost) {
      constraints.push({
        name: 'node',
        value: Docker._getSwarmNodename(cv.dockerHost),
        type: 'soft'
      })
    }

    // everything must be strings
    var labels = {
      instanceId: instance._id.toString(),
      instanceName: instance.name.toString(),
      instanceShortHash: instance.shortHash.toString(),
      contextVersionId: cv._id.toString(),
      ownerUsername: opts.ownerUsername.toString(),
      sessionUserGithubId: opts.sessionUserGithubId.toString(),
      // For logs
      tid: keypather.get(process.domain, 'runnableData.tid.toString()'),
      // Swarm affinities format:  'com.docker.swarm.affinities=["container==redis","image==nginx"]'
      // Swarm constraints format: 'com.docker.swarm.constraints=["region==us-east","storage==ssd"]'
      'com.docker.swarm.constraints': Docker.createSwarmConstraints(constraints),
      // Set the Label type is user-container - used in dockerListener
      type: 'user-container'
    }
    log.trace(put({
      labels: labels
    }, logData), '_createUserContainerLabels labels')

    cb(null, labels)
  })
}

/**
 * returns the swarm node name from the dockerUrl
 * the hostname is the same as the servers hostname which is set by ubuntu
 * `ip-` followed by the ip address replacing `.` with `-`
 * ex. ip-10-0-0-1
 * @param  {String} dockerUrl http://10.17.38.1:44242
 * @return {String}           swarm node name: ip-10-17-38-1
 */
Docker._getSwarmNodename = function (dockerUrl) {
  var parsedUrl = url.parse(dockerUrl)
  return 'ip-' + parsedUrl.hostname.replace(/\./g, '-')
}

/**
 * start a user container
 * @param {String} container - container object to start
 * @param {Object} opts - opts to pass to docker
 * @param {Function} cb - Callback
 */
Docker.prototype.startUserContainer = function (containerId, ownerId, opts, cb) {
  var logData = {
    tx: true,
    containerId: containerId,
    opts: opts,
    elapsedTimeSeconds: new Date()
  }
  log.info(logData, 'Docker.prototype.startUserContainer')
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  opts = put(opts, {
    HostConfig: {
      PublishAllPorts: true,
      Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES
    }
  })
  this.startContainer(containerId, opts, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'startUserContainer: error')
    } else {
      log.trace(logData, 'startUserContainer: success')
    }
    cb.apply(this, arguments)
  })
}

/**
 * CONTAINER METHODS - START
 */

/**
 * create a docker container
 * @param  {imageId}  imageId id of the image from which to make a container
 * @param  {Function} cb      callback(err, container)
 */
Docker.prototype.createContainer = function (opts, cb) {
  var self = this
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  var logData = {
    tx: true,
    opts: opts,
    dockerHost: self.dockerHost
  }
  log.info(logData, 'Docker.prototype.createContainer')
  var start = new Date()
  self.docker.createContainer(opts,
    function (err, response) {
      if (err) {
        log.error(put({
          elapsedTimeSeconds: start,
          err: err
        }, logData),
          'createContainer error ' + keypather.get(opts, 'Labels.type'))
      } else {
        log.trace(put({
          elapsedTimeSeconds: start,
          response: response
        }, logData),
          'createContainer success ' + keypather.get(opts, 'Labels.type'))
      }
      self.handleErr(callback, 'Create container failed',
        { opts: opts }).apply(self, arguments)
    })
  function callback (err, container) {
    if (err) { return cb(err) }
    // normalize id to uppercase....
    container.Id = container.id || container.Id
    cb(null, container)
  }
}

/**
 * docker inspect container
 * @param {String} containerId - docker container Id
 * @param {Function} cb
 */
Docker.prototype.inspectContainer = function (containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  log.info(logData, 'Docker.prototype.inspectContainer')
  var self = this
  var start = new Date()
  this.docker
    .getContainer(containerId)
    .inspect(function (err) {
      if (err) {
        log.error(put({
          elapsedTimeSeconds: start,
          err: err
        }, logData), 'inspectContainer inspect error')
      } else {
        log.trace(put({
          elapsedTimeSeconds: start
        }, logData), 'inspectContainer inspect success')
      }
      self.handleErr(cb, 'Inspect container failed',
        { containerId: containerId }).apply(this, arguments)
    })
}

/**
 * attempts to start a stoped container
 * @param {String} containerId - container object to start
 * @param {Object} opts
 * @param {Function} cb - Callback
 */
Docker.prototype.startContainer = function (containerId, opts, cb) {
  var logData = {
    tx: true,
    containerId: containerId,
    opts: opts
  }
  log.info(logData, 'Docker.prototype.startContainer')
  var self = this
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  var start = new Date()
  self.docker
    .getContainer(containerId)
    .start(opts,
      function (err, response) {
        if (err) {
          log.error(put({ err: err, elapsedTimeSeconds: start }, logData),
            'startContainer startContainer error')
        } else {
          log.info(put({ response: response, elapsedTimeSeconds: start }, logData),
            'startContainer startContainer success')
        }
        self.handleErr(cb, 'Start container failed',
          { containerId: containerId, opts: opts })(err)
      })
}

/**
 * attempts to start a stoped container
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.restartContainer = function (containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  log.info(logData, 'Docker.prototype.restartContainer')
  var self = this
  var start = new Date()
  self.docker
    .getContainer(containerId)
    .restart({},
      function (err, response) {
        if (err) {
          log.error(put({ err: err, elapsedTimeSeconds: start }, logData),
            'restartContainer restartContainer error')
        } else {
          log.trace(put({ response: response, elapsedTimeSeconds: start }, logData),
            'restartContainer restartContainer success')
        }
        self.handleErr(cb,
          'Restart container failed',
          { containerId: containerId }).apply(self, arguments)
      })
}

/**
 * attempts to stop a running container.
 * if not stopped in passed in time, the process is kill 9'd
 * @param {String} containerId
 * @param {Boolean} force Force stop a container. Ignores 'already stopped' error.
 * @param {Function} cb
 */
Docker.prototype.stopContainer = function (containerId, force, cb) {
  var logData = put({
    containerId: containerId,
    force: force
  }, this.logData)
  log.info(logData, 'Docker.prototype.stopContainer')
  if (isFunction(force)) {
    cb = force
    force = false
  }
  var self = this
  var opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  }
  var start = new Date()
  self.docker
    .getContainer(containerId)
    .stop(opts,
      function (err, response) {
        if (err) {
          log.error(put({
            elapsedTimeSeconds: start,
            err: err
          }, logData), 'stopContainer error')
        } else {
          log.trace(put({
            elapsedTimeSeconds: start,
            response: response
          }, logData), 'stopContainer success')
        }
        self.handleErr(callback, 'Stop container failed',
          { opts: opts, containerId: containerId }).apply(self, arguments)
      })

  function callback (err) {
    // ignore "already stopped" error (304 not modified)
    if (err) {
      var newLogData = put({ err: err }, logData)
      if (force && notModifiedError(err)) {
        log.info(newLogData, 'stopContainer callback ignore already-stoped error')
        return callback(null)
      }
      log.error(newLogData, 'stopContainer callback error')
      return cb(err)
    }
    cb(null)
  }
}
function notModifiedError (err) {
  var statusCode = keypather.get(err, 'output.statusCode')
  return statusCode === 304
}

/**
 * attempts to remove a non-running container.
 * if the container is running, an error should be thrown
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  log.info(logData, 'Docker.prototype.removeContainer')
  var self = this
  var start = new Date()
  self.docker
    .getContainer(containerId)
    .remove({},
      function (err, response) {
        if (err) {
          log.error(put({
            elapsedTimeSeconds: start,
            err: err
          }, logData), 'removeContainer error')
        } else {
          log.trace(put({
            elapsedTimeSeconds: start,
            response: response
          }, logData), 'removeContainer success')
        }
        self.handleErr(cb, 'Remove container failed',
          { containerId: containerId }).apply(self, arguments)
      })
}

/**
 * CONTAINER METHODS - END
 */

/**
  Create copy of original Docker method but with special first options agrument.
  First option argument may have 3 keys:
    - times - number of times original method should be called/retried in case of error
    - interval - how long to wait between attempts
    - ignoreStatusCode - original error status code
           that can be counted as success (no retries would be
  Following methods are available:
    - inspectContainerWithRetry
    - removeContainerWithRetry
    - stopContainerWithRetry
*/
;[
  'inspectContainer',
  'removeContainer',
  'stopContainer',
  'createImageBuilder',
  'startImageBuilderContainer',
  'startUserContainer'
].forEach(function (method) {
  var newMethodName = method + 'WithRetry'
  Docker.prototype[newMethodName] = function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    log.info({tx: true, args: args}, 'Docker.prototype.' + newMethodName)
    // first argument should be method options
    var opts = args.shift()
    var retryOpts = pick(opts, ['times', 'interval'])
    var finalCb = args.pop()
    var attemptCount = 0

    async.retry(retryOpts, function (cb) {
      attemptCount++
      // clone args. we need clone since we do modification on each retry iteration
      var cbArgs = args.slice()
      var retryCb = function (err, result) {
        attemptCount++
        if (err) {
          log.error({
            tx: true,
            err: err,
            attemptCount: attemptCount
          }, method + ' attempt failure')
          // we shouldn't retry on some specific error codes
          var errStatusCode = keypather.get(err, 'output.statusCode') || err.statusCode
          if (opts.ignoreStatusCode && opts.ignoreStatusCode === errStatusCode) {
            log.info({
              tx: true,
              err: err,
              attemptCount: attemptCount
            }, method + ' no retry call:' + err.statusCode)
            return cb(null)
          }
        } else {
          log.trace({
            tx: true,
            result: result,
            attemptCount: attemptCount
          }, method + ' attempt success')
        }
        cb.apply(this, arguments)
      }
      cbArgs.push(retryCb)
      self[method].apply(self, cbArgs)
    }, function (err) {
      if (err) {
        log.warn({
          tx: true,
          err: err,
          attemptCount: attemptCount
        }, method + ' final failure')
      } else {
        log.trace({
          tx: true,
          err: err,
          attemptCount: attemptCount
        }, method + ' final success')
      }
      finalCb.apply(this, arguments)
    })
  }
})

/**
 * returns a callback which will cast docker errors to boom errors (if an error occurs)
 * @param  {Function} cb         callback to pass arguments through to
 * @param  {String}   errMessage boom error message
 * @param  {Object}   errDebug   docker error debug info
 */
Docker.prototype.handleErr = function (cb, errMessage, errDebug) {
  var self = this
  return function (err) {
    if (err) {
      var code
      if (!err.statusCode) {
        code = 504
      } else if (err.statusCode === 500) {
        code = 502
      } else { // code >= 400 && code !== 500
        code = err.statusCode
      }
      var dockerErrMessage = err.message.split(' - ')[1] || err.reason || err.message
      var message = dockerErrMessage
        ? errMessage + ': ' + dockerErrMessage
        : errMessage
      var errDocker = extend({
        host: self.dockerHost,
        port: self.port
      }, errDebug || {})

      if (Docker._isImageNotFoundErr(errDebug)) {
        // Lowering reporting level of image-not-found errors. This error is expected to occur
        // with normal swarm operation.
        // https://runnable.atlassian.net/browse/SAN-3081
        cb(Boom.create(400, message, { docker: errDocker, err: err }))
        return
      }

      if (code >= 400) {
        cb(Boom.create(code, message, { docker: errDocker, err: err }))
        monitor.increment('api.docker.handleErr.codes', 1, [
          'code:' + code,
          'host:' + self.dockerHost
        ])
      } else {
        // FIXME: hack for now - we need a way of transporting 300 errors to the user
        // other than boom..
        var boomErr = Boom.create(400, message, { docker: errDocker, err: err })
        boomErr.output.statusCode = code
        cb(boomErr)
      }
      return
    }
    cb.apply(null, arguments)
  }
}

// note: promisifyAll must be at the bottom
bluebird.promisifyAll(Docker)
bluebird.promisifyAll(Docker.prototype)
