/**
 * Docker client model
 * @module lib/models/apis/docker
 */
'use strict'
const Boom = require('dat-middleware').Boom
const defaults = require('101/defaults')
const Dockerode = require('dockerode')
const dogerode = require('dogerode')
const extend = require('101/assign')
const fs = require('fs')
const isFunction = require('101/is-function')
const isObject = require('101/is-object')
const isString = require('101/is-string')
const join = require('path').join
const keypather = require('keypather')()
const map = require('object-loops/map')
const pick = require('101/pick')
const Promise = require('bluebird')
const put = require('101/put')
const retry = require('retry')
const url = require('url')

const error = require('error')
const joi = require('utils/joi')
const logger = require('middlewares/logger')(__filename)
const monitor = require('monitor-dog')
const toJSON = require('utils/to-json')
const utils = require('middlewares/utils')

const log = logger.log

// try/catch is a better pattern for this, since checking to see if it exists
// and then reading files can lead to race conditions (unlikely, but still)
let certs = {}
try {
  // DOCKER_CERT_PATH is docker's default thing it checks - may as well use it
  const certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker'
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
  const dockerHost = opts.host
  this.logData = {
    dockerHost: dockerHost,
    opts: opts
  }
  log.info(this.logData, 'Docker constructor')

  const parsed = url.parse(dockerHost)
  this.dockerHost = parsed.protocol + '//' + parsed.host
  this.port = parsed.port
  const dockerodeOpts = defaults(opts, {
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
 * @param {Object} opts.organization - Organization object with `id` and other props
 * @param {Object} opts.contextVersion - contextVersion to be built
 * @param {Boolean} opts.noCache -
 * @param {String} opts.tid
 */
Docker.prototype.createImageBuilder = function (opts, cb) {
  const logData = { opts }
  log.info(logData, 'Docker.prototype.createImageBuilder')
  const validationError = this._createImageBuilderValidateCV(opts.contextVersion)
  if (validationError) {
    return cb(validationError)
  }
  const self = this

  const dockerTag = Docker.getDockerTag(opts.contextVersion)
  const labelsOpts = pick(opts, [
    'contextVersion', 'manualBuild', 'noCache', 'sessionUser', 'organization', 'tid'
  ])
  const buildContainerLabels = this._createImageBuilderLabels(
    Object.assign({}, labelsOpts, {
      dockerTag
    })
  )

  const minMemoryLimit = opts.contextVersion.getUserContainerMemoryLimit()
  const maxMemoryLimit = Math.max(minMemoryLimit, process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES)

  const organization = opts.organization
  const builderContainerData = {
    Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
    Env: this._createImageBuilderEnv({
      dockerTag: dockerTag,
      noCache: opts.noCache,
      contextVersion: opts.contextVersion,
      organization: opts.organization
    }),
    HostConfig: {
      Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
      // https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities
      CapDrop: process.env.CAP_DROP.split(','),
      Memory: maxMemoryLimit,
      MemoryReservation: minMemoryLimit
    },
    Labels: buildContainerLabels
  }
  if (organization && organization.privateRegistryUrl && organization.privateRegistryUsername) {
    const volumes = {}
    volumes[process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH] = {}
    builderContainerData.Volumes = volumes
    builderContainerData.HostConfig.Binds.push(process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH + ':' + process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH)
  }
  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    builderContainerData.HostConfig.Binds.push(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw')
  }
  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    builderContainerData.HostConfig.Binds.push(process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw')
  }
  if (process.env.DOCKER_IMAGE_BUILDER_HOST_CONFIG_PATH) {
    // Path to a docker config file
    const configPath = process.env.DOCKER_IMAGE_BUILDER_HOST_CONFIG_PATH
    builderContainerData.HostConfig.Binds.push(`${configPath}:${configPath}:r`)
    builderContainerData.Env.push(`RUNNABLE_HOST_DOCKER_CONFIG_PATH=${configPath}`)
  }
  self.createContainer(builderContainerData, function (err, container) {
    if (err) {
      log.error(put({ err }, logData), 'createImageBuilder createContainer failed')
      return self._handleCreateContainerError(err, builderContainerData, cb)
    }
    log.trace(put({ container }, logData), 'createImageBuilder createContainer success')

    cb(null, container)
  })
}

/**
 * Checks container create errors to detemine if they correspond to a cluster
 * not having any nodes (constraints error) or if the cluster is
 * out-of-memory (resource error).
 *
 * When we detect one of these types of errors we report the error as critical
 * to rollbar and send an event to datadog.
 *
 * @param {Object} err Container create error as returned by dockerode.
 * @param {Object} opts Options used during the container create.
 * @param {Function} cb Callback to execute after we have handled the error.
 */
Docker.prototype._handleCreateContainerError = function (err, opts, cb) {
  // Verify we have correctly formatted data (defensive)
  if (!isObject(opts)) {
    logger.log.error({
      method: '_handleCreateContainerError',
      err: err,
      opts: opts
    }, 'Invalid create container `opts` provided')
    return cb(err)
  }

  let org = 'unknown'
  let constraints = 'unknown'
  if (opts.Labels && isString(opts.Labels['com.docker.swarm.constraints'])) {
    constraints = opts.Labels['com.docker.swarm.constraints']
    const match = constraints.match(/^.*org==(\d+).*$/)
    if (match && match.length > 0) {
      org = match[1]
    }
  }
  keypather.set(err, 'data.org', org)

  const log = logger.log.child({
    method: '_handleCreateContainerError',
    org: org,
    memory: opts.Memory,
    constraints: constraints,
    err: err,
    opts: opts
  })
  log.info('Handling container create error')

  const isConstraintFailure = new RegExp('unable to find a node that satisfies')
    .test(err.message)
  const isResourceFailure = new RegExp('no resources available to schedule')
    .test(err.message)

  if (isConstraintFailure) {
    log.error('Unable to find dock for org')
    monitor.event({
      title: 'Cannot find dock for org: ' + org,
      text: 'Container create options: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
    keypather.set(err, 'data.level', 'critical')
    error.log(err)
  }

  if (isResourceFailure) {
    log.error('Unable to find dock with required resources')
    monitor.event({
      title: 'Out of dock resources for org: ' + org,
      text: 'Container create options: ' + JSON.stringify(opts),
      alert_type: 'error'
    })
    keypather.set(err, 'data.level', 'error')
    error.log(err)
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
  return err.statusCode === 500 && /image \S+:\S+ not found/.test(err.message)
}

/**
 * Detect socket hangup errors. We will probably just re-try when this happens.
 *  * error
 * @param {Object} err
 * @return Boolean
 */
Docker._isSocketHangupErr = function (err) {
  return err.message.match(/socket hang up/i) !== null
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
  const constrains = constraintsArray.map(function (constraint) {
    const operator = constraint.type === 'hard' ? '==' : '==~'
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
  const logData = { contextVersion: contextVersion }
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

function stringifyLabels (labels) {
  return map(labels, function (val) {
    return val + ''
  })
}

function parseSessionUserLabels (sessionUser) {
  const labels = {
    sessionUserDisplayName: sessionUser.accounts.github.displayName,
    sessionUserGithubId: sessionUser.accounts.github.id,
    sessionUserUsername: sessionUser.accounts.github.username
  }
  const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
  if (sessionUserBigPoppaId) {
    return Object.assign({}, labels, {
      sessionUserBigPoppaId
    })
  }
  return labels
}

/**
 * Create labels hash for image builder container
 * @param {Object} opts.contextVersion
 * @param {String} opts.dockerTag
 * @param {Boolean} opts.manualBuild
 * @param {Boolean} opts.noCache
 * @param {Object} opts.organization
 * @param {String} opts.organization.githubUsername
 * @param {Object} opts.sessionUser
 * @param {String} opts.tid
 * @return {Object} image builder container labels
 */
Docker.prototype._createImageBuilderLabels = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderLabels')
  const cvJSON = toJSON(opts.contextVersion)
  const organization = opts.organization
  let orgId = this._checkIfPersonalAccount(keypather.get(opts, 'sessionUser.accounts.github.id'), cvJSON.owner.github)
  const constraints = [{
    name: 'org',
    value: orgId,
    type: 'hard'
  }]
  const labels = {
    tid: opts.tid,
    'com.docker.swarm.constraints': Docker.createSwarmConstraints(constraints),
    // TODO contextVersion._id deprecated. Use contextVersionId
    'contextVersion._id': cvJSON._id,
    contextVersionId: cvJSON._id,
    'contextVersion.build._id': cvJSON.build._id,
    'contextVersion.context': cvJSON.context,
    dockerTag: opts.dockerTag,
    manualBuild: opts.manualBuild,
    noCache: opts.noCache,
    githubOrgId: cvJSON.owner.github,
    ownerUsername: organization.githubUsername,
    type: 'image-builder-container'
  }
  const userLabels = parseSessionUserLabels(opts.sessionUser)
  // all labels must be strings
  const finalLabels = stringifyLabels(Object.assign({}, labels, userLabels))
  log.trace(put({
    labels: finalLabels
  }, this.logData), '_createImageBuilderLabels labels')
  return finalLabels
}

/**
  * Get environment variables for image-builder container run
  *
  * @param {Object}       opts
  * @param {Object}       opts.contextVersion
  * @param {Object}       opts.dockerTag
  * @param {Object}       opts.organization
  * @param {String=}      opts.organization.privateRegistryUrl
  * @param {String=}      opts.organization.privateRegistryUsername
  *
  * @return {String[]} env strings
  * @private
 */
Docker.prototype._createImageBuilderEnv = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderEnv')
  const contextVersion = opts.contextVersion
  const dockerTag = opts.dockerTag
  const buildDockerfilePath = contextVersion.buildDockerfilePath
  const buildDockerContext = contextVersion.buildDockerContext
  const infraCodeVersion = contextVersion.infraCodeVersion
  const bucket = infraCodeVersion.bucket()
  const indexedVersions = {}
  infraCodeVersion.files.forEach(function (file) {
    indexedVersions[file.Key] = file.VersionId
  })
  const organization = opts.organization
  const env = [
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
  // registry envs
  if (organization && organization.privateRegistryUrl && organization.privateRegistryUsername) {
    env.push('RUNNABLE_VAULT_TOKEN_FILE_PATH=' + process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH)
    env.push('RUNNABLE_VAULT_ENDPOINT=' + process.env.USER_VAULT_ENDPOINT)
    env.push('RUNNABLE_DOCKER_REGISTRY_URL=' + organization.privateRegistryUrl)
    env.push('RUNNABLE_DOCKER_REGISTRY_USERNAME=' + organization.privateRegistryUsername)
    env.push('RUNNABLE_ORG_ID=' + organization.id)
  }

  const repoUrls = []
  const commitishs = []
  const prs = []
  const deployKeys = []
  contextVersion.appCodeVersions.forEach(function (acv) {
    repoUrls.push(`git@${process.env.GITHUB_HOST}:${acv.repo}`)
    // use either a commit, branch, or default to master
    commitishs.push(acv.commit || acv.branch || 'master')
    prs.push(acv.pullRequest)
    if (acv.privateKey) {
      deployKeys.push(acv.privateKey)
    }
  })
  env.push('RUNNABLE_REPO=' + repoUrls.join(';'))
  env.push('RUNNABLE_COMMITISH=' + commitishs.join(';'))
  env.push('RUNNABLE_PRS=' + prs.join(';'))
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
  if (buildDockerContext) {
    env.push('RUNNABLE_BUILD_DOCKER_CONTEXT=' + buildDockerContext)
  }

  // need because we modify Dockefile with wait for weave command
  env.push('RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE)

  // pass in the NODE_ENV
  env.push('NODE_ENV=' + process.env.NODE_ENV)

  const buildOpts = {
    forcerm: true,
    pull: true
  }
  if (opts.noCache === true) {
    buildOpts.nocache = true
  }
  env.push('RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts))

  return env
}

/**
 * Replace strings for ENVs with their actual value
 * @param {Array[String]} Array of ENV var strings
 * @returns {Array[String]} Array of ENV var strings
 */
Docker._evalEnvVars = function (envVars) {
  const envVarHash = {}
  // Match all ENVs in a string
  const globalEnvVarRegex = /\$\{?[a-zA-Z_]+[a-zA-Z0-9_]*\}?/g
  // Match the first ENV with a subgroup for the var name
  const envVarRegex = /\$\{?([a-zA-Z_]+[a-zA-Z0-9_]*)\}?/
  // Match the first equal sign (split var name and value)
  const envVarNameSplit = /=(.*)/
  // See: http://stackoverflow.com/a/2821201

  return envVars.map(function (env) {
    const envSplit = env.split(envVarNameSplit)
    const envKey = envSplit[0]
    const envContent = envSplit[1] // Ignore var name
    let result

    const envMatches = envContent.match(globalEnvVarRegex)
    if (envMatches !== null) {
      // Find all ENVs used in the value of this ENV
      result = env.replace(globalEnvVarRegex, function (text) {
        const match = text.match(envVarRegex)
        const envKey = text.match(envVarRegex)[1]
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
    opts: opts
  }, 'Docker.prototype.createUserContainer')
  const self = this
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
    const cv = opts.contextVersion
    const instance = opts.instance
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
    const env = Docker._evalEnvVars([
      'RUNNABLE_CONTAINER_ID=' + instance.shortHash,
      'RUNNABLE_CONTAINER_URL=' + instance.elasticHostname
    ].concat(instance.env))

    // create container
    self._createUserContainerLabels(opts, function (err, labels) {
      if (err) { return cb(err) }

      const minMemoryLimit = opts.contextVersion.getUserContainerMemoryLimit()
      const maxMemoryLimit = Math.max(minMemoryLimit, process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES)
      const userContainerData = {
        Labels: labels,
        // limit memory for container
        HostConfig: {
          PublishAllPorts: true,
           // https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities
          CapDrop: process.env.CAP_DROP.split(','),
          Memory: maxMemoryLimit,
          MemoryReservation: minMemoryLimit
        },
        Env: env,
        Image: cv.build.dockerTag
      }

      Docker._addCmdAndPortsToDataFromInstance(userContainerData, instance)

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
 * Modifies passed in data with Cmd and Ports if needed
 * @param  {Instance} instance
 * @return {undefined}
 */
Docker._addCmdAndPortsToDataFromInstance = (data, instance) => {
  if (instance.containerStartCommand) {
    data.Cmd = ['/bin/sh', '-c', process.env.RUNNABLE_WAIT_FOR_WEAVE + ' ' + instance.containerStartCommand]
  }
  if (Array.isArray(instance.ports) && instance.ports.length > 0) {
    const exposedPorts = instance.ports.reduce((obj, port) => {
      obj[port + '/tcp'] = {}
      return obj
    }, {})
    data.ExposedPorts = exposedPorts
  }
}

/**
 * Create labels hash for instance container
 * @param  {Object} opts.contextVersion
 * @param  {Object} opts.instance
 * @param  {Object} opts.sessionUser
 * @param  {String} opts.ownerUsername
 * @param  {String} opts.deploymentUuid
 * @param  {String} opts.tid
 * @param  {Function} callback(err, labels) (sync)
 */
Docker.prototype._createUserContainerLabels = function (opts, cb) {
  const logData = {
    opts: opts,
    elapsedTimeSeconds: new Date()
  }
  const self = this
  log.info(logData, 'Docker.prototype._createUserContainerLabels')
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
      }).unknown().required()
    }).unknown().required(),
    sessionUserGithubId: joi.any().required(),
    ownerUsername: joi.string().required(),
    tid: joi.string().required()
  }).unknown().required(), function (err) {
    if (err) { return cb(err) }

    const instance = toJSON(opts.instance)
    const cv = toJSON(opts.contextVersion)
    let orgId = self._checkIfPersonalAccount(+opts.sessionUserGithubId, cv.owner.github)
    const constraints = [{
      name: 'org',
      value: orgId,
      type: 'hard'
    }]

    if (cv.dockerHost) {
      constraints.push({
        name: 'node',
        value: Docker._getSwarmNodename(cv.dockerHost, cv.owner.github),
        type: 'soft'
      })
    }

    // TODO: extract common properties with user labels
    // https://github.com/CodeNow/api/issues/1741
    // everything must be strings
    const labels = {
      tid: opts.tid,
      contextVersionId: cv._id.toString(),
      instanceId: instance._id.toString(),
      instanceName: instance.name.toString(),
      instanceShortHash: instance.shortHash.toString(),
      githubOrgId: cv.owner.github,
      ownerUsername: opts.ownerUsername,
      // Swarm affinities format:  'com.docker.swarm.affinities=["container==redis","image==nginx"]'
      // Swarm constraints format: 'com.docker.swarm.constraints=["region==us-east","storage==ssd"]'
      'com.docker.swarm.constraints': Docker.createSwarmConstraints(constraints),
      // Set the Label type is user-container - used in dockerListener
      type: 'user-container'
    }
    const userLabels = {
      sessionUserGithubId: opts.sessionUserGithubId
    }
    // all labels must be strings
    const finalLabels = stringifyLabels(Object.assign({}, labels, userLabels))
    log.trace(put({
      labels: finalLabels
    }, logData), '_createUserContainerLabels labels')

    cb(null, finalLabels)
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
  const parsedUrl = url.parse(dockerUrl)
  return 'ip-' + parsedUrl.hostname.replace(/\./g, '-') + '.' + org
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
  const self = this
  if (isFunction(opts)) {
    cb = opts
    opts = {}
  }
  const logData = {
    opts: opts,
    dockerHost: self.dockerHost
  }
  log.info(logData, 'Docker.prototype.createContainer')
  const start = new Date()
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

Docker.prototype._checkIfPersonalAccount = function (sessionUserGithubId, cvOwnerGithubId) {
  if (sessionUserGithubId === cvOwnerGithubId) {
    return process.env.SHARED_GITHUB_ID
  }
  return cvOwnerGithubId
}

/**
 * Call `getLogs` and try it forever with exponential backoff if we got
 * `ETIMEDOUT` error trying to talk to Swarm
 * @param {String} containerId - docker container Id
 * @param {String} tail count
 * @param {Function} cb (err, stream)
 */
Docker.prototype.getLogsAndRetryOnTimeout = function (containerId, tail, cb) {
  const logData = {
    containerId
  }
  const log = logger.log.child(logData)
  log.info('Docker.prototype.getLogsAndRetryOnTimeout')
  const self = this
  const operation = retry.operation({
    forever: true,
    minTimeout: process.env.MIN_LOG_RETRY_TIMEOUT
  })
  operation.attempt(function (currentAttempt) {
    log.trace({ currentAttempt: currentAttempt }, 'getLogsAndRetryOnTimeout attempt')
    self.getLogs(containerId, tail, function (err, stream) {
      if (err) {
        const errorCode = keypather.get(err, 'data.err.code') || err.code
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
  const opts = {
    follow: true,
    stdout: true,
    stderr: true,
    tail: tail
  }
  const logData = {
    containerId,
    opts
  }
  log.info(logData, 'Docker.prototype.getLogs')
  this._containerAction(containerId, 'logs', opts, cb)
}

/**
 * attempts to start a stoped container
 * @param {String} containerId - container object to start
 * @param {Object} opts
 * @param {Function} cb - Callback
 */
Docker.prototype.startContainer = function (containerId, opts, cb) {
  const logData = {
    containerId,
    opts
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
  const logData = {
    containerId
  }
  log.info(logData, 'Docker.prototype.restartContainer')
  this._containerAction(containerId, 'restart', {}, cb)
}

Docker.prototype.deleteInstanceVolume = function (volume) {
  const logData = {
    volume
  }
  log.info(logData, 'Docker.prototype.deleteInstanceVolume')
  // Workaround to give docker time to release volume to be deleted
  return Promise.delay(1000)
    .then(() => {
      return this._volumeAction(volume.Name, 'remove')
    })
}

/**
 * clear memory limits on a container
 * @param {String} containerId   id of target container
 * @param {Function} cb
 */
Docker.prototype.clearContainerMemory = function (containerId, cb) {
  const logData = {
    containerId
  }
  log.info(logData, 'Docker.prototype.clearContainerMemory')
  // TODO: set to 0 once docker fixes this
  // https://github.com/CodeNow/api/issues/1742
  this._containerAction(containerId, 'update', {
    Memory: 4194304, // 4mb lowest docker supports
    MemoryReservation: 4194304 // 4mb is lowest you can set
  }, cb)
}

/**
 * attempts to stop a running container.
 * if not stopped in passed in time, the process is kill 9'd
 * @param {String} containerId
 * @param {Boolean} force Force stop a container. Ignores 'already stopped' error.
 * @param {Function} cb
 */
Docker.prototype.stopContainer = function (containerId, force, cb) {
  const logData = put({ containerId, force }, this.logData)
  log.info(logData, 'Docker.prototype.stopContainer')
  if (isFunction(force)) {
    cb = force
    force = false
  }
  const opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  }
  this._containerAction(containerId, 'stop', opts, callback)
  function callback (err) {
    // ignore "already stopped" error (304 not modified)
    if (err) {
      const newLogData = put({ err: err }, logData)
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

/**
 * attempts to kill a running container.
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.killContainer = function (containerId, cb) {
  const logData = {
    containerId
  }
  log.info(logData, 'Docker.prototype.killContainer')
  this._containerAction(containerId, 'kill', {}, cb)
}

function notModifiedError (err) {
  const statusCode = keypather.get(err, 'output.statusCode')
  return statusCode === 304
}

/**
 * Remove any container.
 * If the container is running it still would be removed.
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  const logData = { containerId }
  log.info(logData, 'Docker.prototype.removeContainer')
  this._containerAction(containerId, 'remove', { force: true }, cb)
}
/**
 * Call `execContainer` and try it forever with exponential backoff if we got
 * `ETIMEDOUT` error trying to talk to Swarm
 * @param {String} containerId - docker container Id
 * @param {Function} cb (err, stream)
 */
Docker.prototype.execContainerAndRetryOnTimeout = function (containerId, cb) {
  const logData = {
    containerId
  }
  const log = logger.log.child(logData)
  log.info('Docker.prototype.execContainerAndRetryOnTimeout')
  const self = this
  const operation = retry.operation({
    forever: true,
    minTimeout: process.env.MIN_EXEC_RETRY_TIMEOUT
  })
  operation.attempt(function (currentAttempt) {
    log.trace({ currentAttempt: currentAttempt }, 'execContainerAndRetryOnTimeout attempt')
    self.execContainer(containerId, function (err, stream) {
      if (err) {
        const errorCode = keypather.get(err, 'data.err.code') || err.code
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
  const logData = {
    containerId
  }
  log.info(logData, 'Docker.prototype.execContainer')
  const opts = {
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['bash']
  }
  const self = this
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
          { containerId })(startErr)
      }
      log.trace(logData, 'execContainer start success')
      cb(null, stream)
    })
  }
}

/**
 * pushes docker image to registry. Resolves when push complete
 * @param  {string} imageId id of image to push to registry
 *                  format: registry.runnable.com/123/456:<tag>
 * @return {Promise} Resolves when push complete
 */
Docker.prototype.pushImage = function (imageTag) {
  const log = logger.log.child({
    imageTag,
    method: 'Docker.pushImage'
  })
  log.info('pushImage called')
  const image = imageTag.split(':')[0]
  const tag = imageTag.split(':')[1]

  return Promise.fromCallback((cb) => {
    this.docker.getImage(image).push({
      tag: tag
    }, (err, stream) => {
      if (err) { return cb(err) }
      // followProgress will return with an argument if error
      this.docker.modem.followProgress(stream, cb)
    })
  })
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
  const self = this
  const logData = {
    containerId,
    action,
    opts
  }
  const log = logger.log.child(logData)
  monitor.increment('api.docker.call.' + action)
  const start = new Date()
  const container = this.docker.getContainer(containerId)
  container[action](opts, function (err, response) {
    if (err) {
      monitor.increment('api.docker.call.failure.' + action, 1, [
        'code:' + err.statusCode
      ])
      log.error({
        elapsedTimeSeconds: start,
        err
      }, action + ' error')
    } else {
      log.trace({
        elapsedTimeSeconds: start,
        // if it's a stream don't log it
        response: response && response.readable ? 'stream' : response
      }, action + ' success')
    }
    self.handleErr(cb, 'Container action ' + action + ' failed',
      { opts, containerId }).apply(self, arguments)
  })
}

/**
 * Function to perform docker action on the Container
 * It also reports data to the datadog (count events) and logs response.
 * @param {String} containerId - Container ID
 * @param {String} action - Docker operation like `start`, `logs`, `exec` etc
 * @param {Object} opts - options to pass for the Docker action
 * @param {Function} cb standard callback
 */
Docker.prototype._volumeAction = function (volumeId, action) {
  const logData = {
    volumeId,
    action
  }
  const log = logger.log.child(logData)
  monitor.increment('api.docker.call.' + action)
  const startTime = new Date()
  const volume = this.docker.getVolume(volumeId)
  return Promise.fromCallback(cb => volume[action]({}, cb))
    .tap((response) => {
      log.trace({
        elapsedTimeSeconds: startTime,
        response
      }, action + ' success')
    })
    .catch((err) => {
      log.error({
        elapsedTimeSeconds: startTime,
        err
      }, action + ' error')
      throw err
    })
}

/**
 * returns a callback which will cast docker errors to boom errors (if an error occurs)
 * @param  {Function} cb         callback to pass arguments through to
 * @param  {String}   errMessage boom error message
 * @param  {Object}   errDebug   docker error debug info
 */
Docker.prototype.handleErr = function (cb, errMessage, errDebug) {
  const self = this
  return function (err) {
    if (err) {
      let code
      if (!err.statusCode) {
        code = 504
      } else if (err.statusCode === 500) {
        code = 502
      } else { // code >= 400 && code !== 500
        code = err.statusCode
      }
      const dockerErrMessage = err.message.split(' - ')[1] || err.reason || err.message
      const message = dockerErrMessage
        ? errMessage + ': ' + dockerErrMessage
        : errMessage
      const errDocker = extend({
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
        const boomErr = Boom.create(400, message, { docker: errDocker, err: err })
        boomErr.output.statusCode = code
        cb(boomErr)
      }
      return
    }
    cb.apply(null, arguments)
  }
}

// note: promisifyAll must be at the bottom
Promise.promisifyAll(Docker)
Promise.promisifyAll(Docker.prototype)
