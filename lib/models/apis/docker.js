/**
 * Docker client model
 * @module lib/models/apis/docker
 */
'use strict'

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
var isString = require('101/is-string')
var join = require('path').join
var JSONStream = require('JSONStream')
var keypather = require('keypather')()
var map = require('object-loops/map')
var once = require('once')
var put = require('101/put')
var retry = require('retry')
var url = require('url')

var error = require('error')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var monitor = require('monitor-dog')
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
      Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
      // https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities
      CapDrop: process.env.CAP_DROP.split(',')
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
  var org = 'unknown'
  var constraints = 'unknown'
  if (opts.Labels && isString(opts.Labels['com.docker.swarm.constraints'])) {
    constraints = opts.Labels['com.docker.swarm.constraints']
    var match = constraints.match(/^.*org==(\d+).*$/)
    if (match && match.length > 0) {
      org = match[1]
    }
  }

  var log = logger.log.child({
    method: '_handleCreateContainerError',
    org: org,
    Memory: opts.Memory,
    constraints: constraints,
    tx: true,
    err: err,
    opts: opts
  })

  log.info('Handling container create error')

  // Determine the type of error we have encountered
  var isConstraintFailure = new RegExp('unable to find a node that satisfies')
    .test(err.message)
  var isResourceFailure = new RegExp('no resources available to schedule')
    .test(err.message)

  // On constraint or resource failure set to critical and report to rollbar.
  if (isConstraintFailure || isResourceFailure) {
    keypather.set(err, 'data.level', 'critical')
    keypather.set(err, 'data.org', org)
    error.log(err)
  }

  if (isConstraintFailure) {
    log.error('Unable to find dock for org')
    monitor.event({
      title: 'Cannot find dock for org: ' + org,
      text: 'Container create options: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
  }

  if (isResourceFailure) {
    log.error('Unable to find dock with required resources')
    monitor.event({
      title: 'Out of dock resources for org: ' + org,
      text: 'Container create options: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
  }

  cb(err)
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
 * Detect socket hangup errors. We will probably just re-try when this happens.
 *  * error
 * @param {Object} err
 * @return Boolean
 */
Docker._isSocketHangupErr = function (err) {
  return err.message.match(/socket\ hang\ up/i) !== null
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
  var constraints = [{
    name: 'org',
    value: cvJSON.owner.github,
    type: 'hard'
  }]
  if (cvJSON.prevDockerHost) {
    constraints.push({
      name: 'node',
      value: Docker._getSwarmNodename(cvJSON.prevDockerHost, cvJSON.owner.github),
      type: 'soft'
    })
  }
  var labels = {
    'contextVersion.build._id': cvJSON.build._id,
    'contextVersion._id': cvJSON._id,
    'contextVersion.context': cvJSON.context,
    dockerTag: opts.dockerTag,
    manualBuild: opts.manualBuild,
    noCache: opts.noCache,
    sessionUserDisplayName: opts.sessionUser.accounts.github.displayName,
    sessionUserGithubId: opts.sessionUser.accounts.github.id,
    sessionUserUsername: opts.sessionUser.accounts.github.username,
    ownerUsername: opts.ownerUsername,
    tid: opts.tid,
    'com.docker.swarm.constraints': Docker.createSwarmConstraints(constraints),
    type: 'image-builder-container'
  }
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
  var buildDockerfilePath = contextVersion.buildDockerfilePath

  var infraCodeVersion = contextVersion.infraCodeVersion
  var bucket = infraCodeVersion.bucket()
  var indexedVersions = {}
  infraCodeVersion.files.forEach(function (file) {
    indexedVersions[file.Key] = file.VersionId
  })
  var env = [
    'RUNNABLE_AWS_ACCESS_KEY=' + process.env.AWS_ACCESS_KEY_ID,
    'RUNNABLE_AWS_SECRET_KEY=' + process.env.AWS_SECRET_ACCESS_KEY,
    'RUNNABLE_BUILD_LINE_TIMEOUT_MS=' + process.env.DOCKER_BUILD_LINE_TIMEOUT_MS,
    'RUNNABLE_DOCKER=' + 'unix:///var/run/docker.sock',
    'RUNNABLE_DOCKERTAG=' + dockerTag,
    'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
    'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
    'RUNNABLE_IMAGE_BUILDER_NAME=' + process.env.DOCKER_IMAGE_BUILDER_NAME,
    'RUNNABLE_IMAGE_BUILDER_TAG=' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
    'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/')
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
  // use selected dockerfile from repo if set
  if (buildDockerfilePath) {
    env.push('RUNNABLE_BUILD_DOCKERFILE=' + buildDockerfilePath)
  }

  // need because we modify Dockefile with wait for weave command
  env.push('RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE)

  // pass in the NODE_ENV
  env.push('NODE_ENV=' + process.env.NODE_ENV)

  // build cpu limit
  var buildOpts = {
    Memory: process.env.BUILD_MEMORY_LIMIT_BYTES,
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
      Binds: binds,
      // https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities
      CapDrop: process.env.CAP_DROP.split(',')
    }
  }
  this.startContainer(containerId, startContainerData, cb)
}

/**
 * Replace strings for ENVs with their actual value
 * @param {Array[String]} Array of ENV var strings
 * @returns {Array[String]} Array of ENV var strings
 */
Docker._evalEnvVars = function (envVars) {
  var envVarHash = {}
  // Match all ENVs in a string
  var globalEnvVarRegex = /\$\{?[a-zA-Z_]+[a-zA-Z0-9_]*\}?/g
  // Match the first ENV with a subgroup for the var name
  var envVarRegex = /\$\{?([a-zA-Z_]+[a-zA-Z0-9_]*)\}?/
  // Match the first equal sign (split var name and value)
  var envVarNameSplit = /=(.*)/
  // See: http://stackoverflow.com/a/2821201

  return envVars.map(function (env) {
    var envSplit = env.split(envVarNameSplit)
    var envKey = envSplit[0]
    var envContent = envSplit[1] // Ignore var name
    var result

    var envMatches = envContent.match(globalEnvVarRegex)
    if (envMatches !== null) {
      // Find all ENVs used in the value of this ENV
      result = env.replace(globalEnvVarRegex, function (text) {
        var match = text.match(envVarRegex)
        var envKey = text.match(envVarRegex)[1]
        if (envKey && envVarHash[match[1]]) {
          // If this ENV has already been defined, replace it with its value
          return envVarHash[match[1]]
        } else {
          // If this ENV has not been definede, return the $VAR_NAME
          return text
        }
      })
    } else {
      result = env
    }
    // Store all values by variable name in case this value is used
    // further down the line
    envVarHash[envKey] = result.split(envVarNameSplit)[1]
    return result
  })
}

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
    contextVersion: joi.object({
      appCodeVersions: joi.array().required()
    }).unknown().required(),
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
    var env = Docker._evalEnvVars([
      'RUNNABLE_CONTAINER_ID=' + instance.shortHash
    ].concat(instance.env))

    // create container
    self._createUserContainerLabels(opts, function (err, labels) {
      if (err) { return cb(err) }

      var userContainerData = {
        Labels: labels,
        // limit memory for container
        HostConfig: {
          PublishAllPorts: true,
          Memory: opts.contextVersion.getUserContainerMemoryLimit(),
          // https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities
          CapDrop: process.env.CAP_DROP.split(',')
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
        value: Docker._getSwarmNodename(cv.dockerHost, cv.owner.github),
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
 * returns the swarm node name from the dockerUrl and org
 * the hostname is the same as the servers hostname which is set by ubuntu
 * `ip-` followed by the ip address replacing `.` with `-`
 * the end has `.` followed by github orgId
 * ex. ip-10-0-0-1.123123
 * @param  {String} dockerUrl http://10.17.38.1:4242
 * @param  {String} org       github org id
 * @return {String}           swarm node name: ip-10-17-38-1.123123
 */
Docker._getSwarmNodename = function (dockerUrl, org) {
  var parsedUrl = url.parse(dockerUrl)
  return 'ip-' + parsedUrl.hostname.replace(/\./g, '-') + '.' + org
}

/**
 * should return all build info. logs, tag,
 * @param {String} containerId
 * @param {Number} exitCode image builder container exit code
 * @param {Function} cb
 */
Docker.prototype.getBuildInfo = function (containerId, exitCode, cb) {
  var opts = {
    follow: false,
    stdout: true,
    stderr: true
  }
  var logData = {
    tx: true,
    containerId: containerId,
    exitCode: exitCode,
    opts: opts
  }
  log.info(logData, 'Docker.prototype.getBuildInfo')
  var self = this
  // prevent multiple callbacks
  cb = once(cb)
  // get container logs stream
  var errDebug = { containerId: containerId }
  this._containerAction(containerId, 'logs', opts, callback)
  function callback (err, stream) {
    if (err) {
      return cb(err)
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
        var successRe = /Successfully built ([a-f0-9]+)/
        for (var i = logArr.length - 1; !dockerImage && i >= 0; i--) {
          var logItem = logArr[i]
          var match = successRe.exec(logItem.content)
          dockerImage = match && match[1]
        }
      }
      var buildInfo = {
        failed: !buildSuccess,
        dockerImage: dockerImage,
        log: logArr
      }
      // we make image-builder exit with 124 if the build timed out
      if (exitCode === 124) {
        buildInfo.error = {
          message: 'timed out'
        }
      }
      cb(null, buildInfo)
    }
  }
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
 * Call `getLogs` and try it forever with exponential backoff if we got
 * `ETIMEDOUT` error trying to talk to Swarm
 * @param {String} containerId - docker container Id
 * @param {String} tail count
 * @param {Function} cb (err, stream)
 */
Docker.prototype.getLogsAndRetryOnTimeout = function (containerId, tail, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  var log = logger.log.child(logData)
  log.info('Docker.prototype.getLogsAndRetryOnTimeout')
  var self = this
  var operation = retry.operation({ forever: true })
  operation.attempt(function (currentAttempt) {
    log.trace({ currentAttempt: currentAttempt }, 'getLogsAndRetryOnTimeout attempt')
    self.getLogs(containerId, tail, function (err, stream) {
      if (err) {
        var errorCode = keypather.get(err, 'data.err.code') || err.code
        log.error({
          errorCode: errorCode,
          err: err,
          currentAttempt: currentAttempt }, 'getLogsAndRetryOnTimeout error')
        if (errorCode === 'ETIMEDOUT') {
          log.info('getLogsAndRetryOnTimeout timeout')
          return operation.retry(err)
        }
      }
      cb(err, stream)
    })
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
  var opts = {
    follow: true,
    stdout: true,
    stderr: true,
    tail: tail
  }
  var logData = {
    tx: true,
    containerId: containerId,
    opts: opts
  }
  log.info(logData, 'Docker.prototype.getLogs')
  this._containerAction(containerId, 'logs', opts, cb)
}

/**
 * Passthrough to startContainer
 * @deprecated
 * @param {String} containerId - Container ID
 * @param {Object} cv - Context Version (not used anymore)
 * @param {Function} cb - Callback
 */
Docker.prototype.startUserContainer = function (containerId, cv, cb) {
  this.startContainer(containerId, cb)
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
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  this._containerAction(containerId, 'start', opts, cb)
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
  this._containerAction(containerId, 'restart', {}, cb)
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
  var opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  }
  this._containerAction(containerId, 'stop', opts, callback)
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
  this._containerAction(containerId, 'remove', {}, cb)
}
/**
 * Call `execContainer` and try it forever with exponential backoff if we got
 * `ETIMEDOUT` error trying to talk to Swarm
 * @param {String} containerId - docker container Id
 * @param {Function} cb (err, stream)
 */
Docker.prototype.execContainerAndRetryOnTimeout = function (containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  var log = logger.log.child(logData)
  log.info('Docker.prototype.execContainerAndRetryOnTimeout')
  var self = this
  var operation = retry.operation({ forever: true })
  operation.attempt(function (currentAttempt) {
    log.trace({ currentAttempt: currentAttempt }, 'execContainerAndRetryOnTimeout attempt')
    self.execContainer(containerId, function (err, stream) {
      if (err) {
        var errorCode = keypather.get(err, 'data.err.code') || err.code
        log.error({
          errorCode: errorCode,
          err: err,
          currentAttempt: currentAttempt }, 'execContainerAndRetryOnTimeout error')
        if (errorCode === 'ETIMEDOUT') {
          log.info('execContainerAndRetryOnTimeout timeout')
          return operation.retry(err)
        }
      }
      cb(err, stream)
    })
  })
}

/**
 * returns stream of a bash session inside of a container
 * @param {String} containerId - docker container Id
 * @param {Function} cb (err, stream)
 */
Docker.prototype.execContainer = function (containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  }
  log.info(logData, 'Docker.prototype.execContainer')
  var opts = {
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['bash']
  }
  var self = this
  this._containerAction(containerId, 'exec', opts, callback)
  function callback (err, exec) {
    if (err) {
      return cb(err)
    }
    exec.start({ stdin: true }, function (startErr, stream) {
      if (startErr) {
        log.error(put({
          err: startErr
        }, logData), 'execContainer start error')
        return self.handleErr(cb, 'exec start failed',
          { containerId: containerId })(startErr)
      }
      log.trace(logData, 'execContainer start success')
      cb(null, stream)
    })
  }
}

/**
 * CONTAINER METHODS - END
 */

/**
 * Function to perform docker action on the Container
 * It also reports data to the datadog (count events) and logs response.
 * @param {String} containerId - Container ID
 * @param {String} action - Docker operation like `start`, `logs`, `exec` etc
 * @param {Object} opts - options to pass for the Docker action
 * @param {Function} cb standard callback
 */
Docker.prototype._containerAction = function (containerId, action, opts, cb) {
  var self = this
  var logData = {
    tx: true,
    containerId: containerId,
    action: action,
    opts: opts
  }
  var log = logger.log.child(logData)
  monitor.increment('api.docker.call.' + action)
  var start = new Date()
  var container = this.docker.getContainer(containerId)
  container[action](opts, function (err, response) {
    if (err) {
      monitor.increment('api.docker.call.failure.' + action, 1, [
        'code:' + err.statusCode
      ])
      log.error({
        elapsedTimeSeconds: start,
        err: err
      }, action + ' error')
    } else {
      log.trace({
        elapsedTimeSeconds: start,
        // if it's a stream don't log it
        response: response && response.readable ? 'stream' : response
      }, action + ' success')
    }
    self.handleErr(cb, 'Container action ' + action + ' failed',
      { opts: opts, containerId: containerId }).apply(self, arguments)
  })
}

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

      if (Docker._isSocketHangupErr(err)) {
        monitor.increment('api.docker.socket_hangup')
        keypather.set(err, 'data.level', 'warning')
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
