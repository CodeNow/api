/**
 * For API requests initiated within API routes
 * @module lib/models/apis/runnable
 */
'use strict'

var ExpressRequest = require('express-request')
var RunnableUser = require('runnable')
var async = require('async')
var put = require('101/put')
var util = require('util')

var Base = require('runnable/lib/models/base')
var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)
var log = logger.log

Base.prototype.parse = function (attrs) {
  if (attrs.toJSON) {
    attrs = attrs.toJSON()
  }
  attrs = JSON.parse(JSON.stringify(attrs))
  return attrs
}

module.exports = Runnable

function Runnable (headers, sessionUser) {
  this.headers = headers
  var app = require('express-app')
  var host = process.env.FULL_API_DOMAIN
  var opts = {}
  if (headers) {
    opts.requestOpts = {
      headers: headers
    }
  }
  if (sessionUser) {
    this.sessionUser = sessionUser
    var User = require('models/mongo/user')
    if (!sessionUser.toJSON) {
      sessionUser = new User(sessionUser)
    }
    opts.requestOpts = opts.requestOpts || {}
    opts.requestOpts.req = {
      connection: { requestAddress: '127.0.0.1' },
      isInternalRequest: true,
      sessionUser: sessionUser,
      session: {
        cookie: {},
        passport: {
          user: sessionUser._id
        }
      }
    }
  }
  RunnableUser.call(this, host, opts)
  this.client.request = new ExpressRequest(app)
  this.client.request.defaults(opts.requestOpts)
}

/**
 * Internal method. Better for unit testing, it is.
 * @private
 * @see {Runnable}
 * @returns {Runnable}
 */
Runnable.createClient = function (headers, sessionUser) {
  return new Runnable(headers, sessionUser)
}

util.inherits(Runnable, RunnableUser)

Runnable.prototype.createEmptySettings = function (owner, cb) {
  log.info({
    tx: true,
    owner: owner
  }, 'Runnable.prototype.createEmptySettings')
  this.createSetting({ owner: owner }, cb)
}

/**
 * Pick properties from existing instance & create new instance
 * @return null
 */
Runnable.prototype.copyInstance = function (sessionUser, build, parentInstance, body, cb) {
  log.info({
    tx: true,
    sessionUser: sessionUser,
    build: build,
    parentInstance: parentInstance,
    body: body
  }, 'Runnable.prototype.copyInstance')
  body.parent = parentInstance.shortHash
  body.build = build.toJSON()._id
  body.env = body.env || parentInstance.env
  body.owner = body.owner || parentInstance.owner
  body.masterPod = body.masterPod || parentInstance.masterPod
  // Calling out to the API to fetch the project and env, then create a new Build
  this.createInstance(body, cb)
}

/**
 * Fork master instance with the new `build` and for the specific `user`.
 * **Automatic** handling of instance duplicate name.
 * @param {Object} masterInst     master instance to be forked
 * @param {String} buildId        id of the build that should be on the new instance
 * @param {String} branch         branch name that will be appended to the name of the new instance
 * @param {Function} cb           standard callback - (err, forkedInstance)
 */
Runnable.prototype.forkMasterInstance = function (masterInst, buildId, branch, cb) {
  var logData = {
    tx: true
  }
  log.info(logData, 'Runnable.prototype.forkMasterInstance')
  // basically only letters, numbers and - are allowed in domain names
  var sanitizedBranch = branch.replace(/[^a-zA-Z0-9]/g, '-')
  var body = {
    parent: masterInst.shortHash,
    build: buildId,
    name: sanitizedBranch + '-' + masterInst.name,
    env: masterInst.env,
    owner: {
      github: masterInst.owner.github
    },
    masterPod: false,
    autoForked: true
  }
  var tags = [
    'env:' + process.env.NODE_ENV
  ]
  this.createInstance(body, function (err, instance) {
    logData.body = body
    if (err) {
      log.error(put(logData, { err: err }), 'forkMasterInstance failure')
      cb(err)
      dogstatsd.increment('api.runnable.fork_master_instance.error', 1, tags)
    } else {
      log.info(logData, 'forkMasterInstance success')
      cb(null, instance)
      dogstatsd.increment('api.runnable.fork_master_instance.success', 1, tags)
    }
  })
}

Runnable.prototype.buildBuild = function (build, opts, cb) {
  log.info({
    tx: true
  }, 'Runnable.prototype.buildBuild')
  if (build.toJSON) {
    build = build.toJSON()
  }
  var buildModel = this
    .newBuild(build._id.toString())
  buildModel.build(opts, cb)
}

/**
 * Create new build and build it. Two API calls
 * @param  {String}   cvId          context version id
 * @param  {Number}   ownerGithubId github id for the new build owner
 * @param  {Number}   triggeredUser github id for the user that triggered action
 * @param  {Object}   codeVersion   codeVersion should include repo, commit, branch, commitLog
 * @param  {Function} cb            standard callback with 2 params. Return newBuild on success
 */
Runnable.prototype.createAndBuildBuild = function (cvId, ownerGithubId, triggeredUser, codeVersion, cb) {
  log.info({
    tx: true,
    ownerGithubId: ownerGithubId,
    codeVersion: codeVersion
  }, 'Runnable.prototype.createAndBuildBuild')
  var newBuildPayload = {
    contextVersions: [cvId],
    owner: {
      github: ownerGithubId
    }
  }
  var buildBuildPayload = {
    triggeredBy: {
      github: triggeredUser
    },
    triggeredAction: {
      manual: false,
      appCodeVersion: codeVersion
    }
  }
  this.createBuild({ json: newBuildPayload }, function (err, newBuild) {
    if (err) { return cb(err) }
    this.buildBuild(newBuild, { json: buildBuildPayload }, cb)
  }.bind(this))
}

Runnable.prototype.createContextVersion = function (contextId, cb) {
  log.info({
    tx: true,
    contextId: contextId
  }, 'Runnable.prototype.createContextVersion')
  this
    .newContext(contextId.toString())
    .createVersion(cb)
}

Runnable.prototype.copyVersionIcvFiles = function (contextId, cvId, icvId, cb) {
  log.info({
    tx: true,
    contextId: contextId,
    cvId: cvId,
    icvId: icvId
  }, 'Runnale.prototype.copyVersionIcvFiles')
  this
    .newContext(contextId.toString())
    .newVersion(cvId.toString())
    .copyFilesFromSource(icvId.toString(), cb)
}

Runnable.prototype.deepCopyContextVersion = function (contextId, contextVersionId, cb) {
  log.info({
    tx: true,
    contextId: contextId,
    contextVersionId: contextVersionId
  }, 'Runnable.prototype.deepCopyContextVersion')
  var newCV = this
    .newContext(contextId.toString())
    .newVersion({
      _id: contextVersionId.toString(),
      context: contextId.toString()
    })
    .deepCopy(function (err) {
      cb(err, newCV)
    })
}

Runnable.prototype.deepCopyContextVersions = function (contextIds, contextVersionIds, cb) {
  log.info({
    tx: true,
    contextIds: contextIds,
    contextVersionIds: contextVersionIds
  }, 'Runnable.prototype.deepCopyContextVersions')
  var self = this
  var idsArr = contextVersionIds.map(function (versionId, i) {
    return {
      contextId: contextIds[i].toString(),
      versionId: versionId.toString()
    }
  })
  async.map(idsArr, function (ids, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser)
    newSelf.deepCopyContextVersion(ids.contextId, ids.versionId, cb)
  }, cb)
}
