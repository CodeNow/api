/**
 * Versions of a Context!
 * @module models/version
 */
'use strict'

var async = require('async')
var Boom = require('dat-middleware').Boom
var deepEqual = require('deep-equal')
var exists = require('101/exists')
var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')
var isFunction = require('101/is-function')
var isObject = require('101/is-object')
var isString = require('101/is-string')
var keypather = require('keypather')()
var mongoose = require('mongoose')
var noop = require('101/noop')
var pick = require('101/pick')
var Promise = require('bluebird')
var put = require('101/put')
var monitorDog = require('monitor-dog')

var dogstatsd = require('models/datadog')
var error = require('error')
var Github = require('models/apis/github')
var InfraCodeVersion = require('models/mongo/infra-code-version')
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var monitor = require('monitor-dog')
var toObjectId = require('utils/to-object-id')

var ContextVersion

/**
 * d1 >= d2
 * @param  {Date} d1 date1
 * @param  {Date} d2 date2
 * @return {Boolean}    d1 >= d2
 */
var dateGTE = function (d1, d2) {
  return (d1 - d2) >= 0
}
var dateLTE = function (d1, d2) {
  return (d1 - d2) <= 0
}

function emitIfCompleted (cv) {
  log.trace({
    tx: true,
    cv: cv
  }, 'emitIfCompleted')
  if (cv.build.completed) {
    log.trace({tx: true}, 'emitIfCompleted completed true')
    messenger.emitContextVersionUpdate(cv, 'build_completed')
  } else {
    log.trace({tx: true}, 'emitIfCompleted completed false')
  }
}

var ContextVersionSchema = require('models/mongo/schemas/context-version')

/**
 * Modifies a ContextVersion query by adding AppCode specific conditions.
 * @param {ContextVersion} contextVersion Context version to use when modifying
 *   the query.
 * @param {object} query The mongo query to modify.
 */
ContextVersionSchema.statics.addAppCodeVersionQuery = function (
  contextVersion,
  query
) {
  if (contextVersion.appCodeVersions.length) {
    query.$and = contextVersion.appCodeVersions.map(function (acv) {
      return {
        appCodeVersions: {
          $elemMatch: {
            lowerRepo: acv.lowerRepo,
            commit: acv.commit
          }
        }
      }
    })
    query.$and.push({
      appCodeVersions: {
        $size: contextVersion.appCodeVersions.length
      }
    })
  } else {
    query.appCodeVersions = { $size: 0 }
  }
  return query
}

/**
 * Writes the build logs from the context version and sends them through the socket
 * @param stream
 * @throws error when logs in not an array or a string
 */
ContextVersionSchema.methods.writeLogsToPrimusStream = function (stream) {
  var logs = keypather.get(this, 'build.log')
  if (isString(logs)) {
    logs = [{
      type: 'log',
      content: logs
    }]
  } else if (!Array.isArray(logs)) {
    throw new Error('cannot stream logs that are not strings or arrays')
  }
  var logData = {
    tx: true,
    logLength: logs.length,
    streamId: stream.id
  }
  log.trace(logData, 'writeLogsToPrimusStream')
  var timer = monitor.timer('build_logs.streaming', true)
  var startingIndex = 0
  async.whilst(function () {
    return startingIndex < logs.length
  }, function (cb) {
    var nextIndex = startingIndex + process.env.BUILD_LOG_PER_BATCH_LIMIT
    var endingIndex = (logs.length < nextIndex) ? logs.length : nextIndex
    stream.write(logs.slice(startingIndex, endingIndex))
    startingIndex = nextIndex
    setTimeout(cb)
  }, function (err) {
    log.trace(logData, 'writeLogsToPrimusStream finished')
    timer.stop('build_logs.streaming')
    stream.end()
    if (err) {
      throw err
    }
  })
}

ContextVersionSchema.statics.createWithNewInfraCode = function (props, cb) {
  var contextVersion = new ContextVersion(props)
  var infraCodeVersion = new InfraCodeVersion({
    context: props.context
  })
  infraCodeVersion.initWithDefaults(function (err) {
    if (err) { return cb(err) }
    contextVersion.infraCodeVersion = infraCodeVersion._id
    contextVersion.save(function (err) {
      if (err) {
        infraCodeVersion.bucket().removeSourceDir(noop)
        cb(err)
      } else {
        infraCodeVersion.save(function (err) {
          if (err) {
            infraCodeVersion.bucket().removeSourceDir(noop)
            contextVersion.remove()
            cb(err)
          } else {
            cb(null, contextVersion)
          }
        })
      }
    })
  })
}

var copyFields = [
  'appCodeVersions',
  'context',
  'owner',
  'advanced',
  'dockRemoved',
  'userContainerMemoryInBytes'
]

/**
 * Creates a new Context Version.
 * @param {Object} user User object who will be the 'createdBy' user.
 * @param {Object} version Context Version to copy.
 * @param {Function} cb Returns the new Context Version.
 */
ContextVersionSchema.statics.createDeepCopy = function (user, version, cb) {
  log.trace({
    tx: true,
    sessionUser: user,
    contextVersion: version
  }, 'ContextVersionSchema.statics.createDeepCopy')
  version = version.toJSON ? version.toJSON() : version
  var newVersion = new ContextVersion(pick(version, copyFields))
  newVersion.createdBy = {
    github: user.accounts.github.id
  }
  if (!version.infraCodeVersion) {
    return cb(Boom.badImplementation('version is missing infraCodeVersion'))
  }
  InfraCodeVersion.createCopyById(version.infraCodeVersion,
    function (err, newInfraCodeVersion) {
      if (err) { return cb(err) }

      newVersion.infraCodeVersion = newInfraCodeVersion._id
      newVersion.save(function (err, version) {
        if (err) {
          newInfraCodeVersion.remove() // remove error handled below
        }
        cb(err, version)
      })
    })
}

/**
 * Fetch github user models for an instance owner
 * and instance createdBy user
 * @param {Object} sessionUser
 * @param {Function} cb
 */
ContextVersionSchema.methods.populateOwner = function (sessionUser, cb) {
  log.trace({
    tx: true,
    sessionUser: sessionUser
  }, 'ContextVersionSchema.methods.populateOwner')
  var self = this
  if (!sessionUser) {
    return cb(Boom.badImplementation('SessionUser is required'))
  }
  sessionUser.findGithubUserByGithubId(this.owner.github, function (err, data) {
    if (err) { return cb(err) }
    self.owner.username = data.login
    self.owner.gravatar = data.avatar_url
    cb(null, self)
  })
}

/**
 * This function is used to not only set the started Date on the current ContextVersion object,
 * but it throws an error if started has already been called previous to this iteration.  This
 * function also sets the edited flag on the InfraCodeVersion to false, since it can no longer
 * be changed after this point.
 * @param user user object of the current user
 * @param cb callback
 */
ContextVersionSchema.methods.setBuildStarted = function (user, buildProps, cb) {
  if (typeof buildProps === 'function') {
    cb = buildProps
    buildProps = {}
  }
  var update = {}
  // FIXME: lets get rid of cv.containerId soon (now mirrors build._id)
  // - used for buildLogs (change to build._id)
  update.$set = {
    'build.started': Date.now(),
    'build.triggeredBy.github': user.accounts.github.id,
    'containerId': this.build._id // FIXME: this is currently used in frontend for dockerLogs
  }
  Object.keys(buildProps).forEach(function (key) {
    update.$set['build.' + key] = buildProps[key]
  })

  var contextVersion = this
  var query = {
    _id: contextVersion._id,
    'build.started': {
      $exists: false
    }
  }

  var triggerAcv = keypather.get(buildProps, 'triggeredAction.appCodeVersion')
  if (triggerAcv) {
    query['appCodeVersions.lowerRepo'] = triggerAcv.repo.toLowerCase()
    update.$set['appCodeVersions.$.commit'] = triggerAcv.commit
  }
  async.waterfall([
    findAndCheckInfraCodeEditedFlag,
    setContextVersionBuildStarted,
    afterSetBuildStarted
  ], cb)

  function findAndCheckInfraCodeEditedFlag (cb) {
    InfraCodeVersion.findById(contextVersion.infraCodeVersion, function (err, infraCodeVersion) {
      if (err) { return cb(err) }
      if (!infraCodeVersion) {
        err = Boom.conflict('InfraCodeVersion could not be found', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        })
        return cb(err)
      }
      if (!infraCodeVersion.parent) {
        // Something went horribly wrong somewhere if we're here.  If an infraCode doesn't have
        // a parent, and it doesn't have an edited property, it's a source
        err = Boom.conflict('Cannot use source infracode versions with builds', {
          debug: {
            contextVersion: contextVersion._id,
            infraCodeVersion: contextVersion.infraCodeVersion
          }
        })
        return cb(err)
      }
      if (!infraCodeVersion.edited) {
        // If the current infraCodeVersion hasn't been edited, then we should set the
        // contextVersion's infraCode to its parent, and delete this one
        update.$set.infraCodeVersion = infraCodeVersion.parent
        InfraCodeVersion.removeById(infraCodeVersion._id, error.logIfErr) // background
      }
      cb()
    })
  }

  function setContextVersionBuildStarted (cb) {
    ContextVersion.findOneAndUpdate(query, update, cb)
  }

  function afterSetBuildStarted (updatedContextVersion, cb) {
    if (!updatedContextVersion) {
      var err = Boom.conflict('Context version build is already in progress.', {
        debug: { contextVersion: contextVersion._id }
      })
      return cb(err)
    }
    messenger.emitContextVersionUpdate(updatedContextVersion, 'build_starting')
    cb(null, updatedContextVersion)
  }
}

/**
 * Finds and replaces with parentInfra if infra is unedited
 * @param  {callback} callback(self/duplicateVersion)
 */
ContextVersionSchema.methods.dedupeInfra = function (cb) {
  var contextVersion = this
  var icvId = contextVersion.infraCodeVersion
  InfraCodeVersion.findById(icvId, function (err, icv) {
    if (err) { return cb(err) }
    if (!icv.edited) {
      contextVersion.set('infraCodeVersion', icv.parent)
      contextVersion.save(function (err) {
        if (err) { return cb(err) }
        InfraCodeVersion.removeById(icvId, next)
      })
    } else {
      next()
    }
    function next (err) {
      cb(err, contextVersion)
    }
  })
}

/**
 * Looks for completed contextVersions with the same state
 * @param  {Function} callback callback(self/duplicateVersion)
 */
ContextVersionSchema.methods.dedupe = function (callback) {
  var logData = {
    tx: true,
    started: this.started,
    infraCodeVersion: this.infraCodeVersion
  }
  log.info(logData, 'ContextVersionSchema.methods.dedupe')
  var self = this
  if (!this.owner) {
    log.warn(logData, 'dedupe !this.owner')
    error.log(Boom.badImplementation('context version owner is null during dedupe', { cv: this }))
  }
  if (this.started) {
    log.warn(logData, 'dedupe !this.started')
    // build is already started and possibly built. no need to check for duplicate.
    return callback(null, self)
  }
  async.waterfall([
    dedupeInfra,
    dedupeSelf
  ], callback)
  var query, opts, allFields
  function dedupeInfra (cb) {
    log.info(logData, 'ContextVersionSchema.methods.dedupe dedupeInfra')
    self.dedupeInfra(function (err) {
      if (err) {
        log.warn(put({
          err: err
        }, logData), 'dedupe self.dedupeInfra error')
      } else {
        log.trace(logData, 'dudupe self.dedupeInfra success')
      }
      cb(err)
    })
  }
  function dedupeSelf (cb) {
    log.info(logData, 'ContextVersionSchema.methods.dedupe dedupeSelf')
    // ownership is essentially verified by infraCodeVersionId
    // but we should make this more secure
    query = {
      'build.started': { $exists: true },
      infraCodeVersion: self.infraCodeVersion
    }
    if (exists(self.advanced)) {
      query.advanced = self.advanced
    }
    query = ContextVersion.addAppCodeVersionQuery(self, query)
    opts = {
      sort: '-build.started',
      limit: 1
    }
    allFields = null
    // find all potential duplicates (acv branches may be different)
    ContextVersion.find(query, allFields, opts, function (err, duplicates) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'dedupe dedupeSelf ContextVersion.find error')
        return cb(err)
      }
      var latestDupe = duplicates[0]
      if (!latestDupe) {
        log.trace(logData, 'dedupe dedupeSelf no dupes found')
        // no dupes found
        cb(null, self)
      } else if (latestDupe.build.completed && keypather.get(latestDupe, 'build.error.message')) {
        // Build container failed, do not dedupe
        log.trace(logData, 'dedupe dedupeSelf build container failed, do not dedupe')
        callback(null, self)
      } else { // dupes were found
        log.trace(logData, 'dedupe dedupeSelf - dupes found')
        if (self.appCodeVersions.length === 0) {
          log.trace(logData, 'dedupe dedupeSelf - dupes found + no branches')
          // No github repos, so no chance for branch to
          // latestDupe is latestExactDupe in this case
          self.remove(error.logIfErr) // delete self
          if (!latestDupe.owner) {
            var msg = 'latestDupe context version owner is null after dedupe'
            error.log(Boom.badImplementation(msg, { cv: latestDupe }))
          }
          cb(null, latestDupe)
        } else {
          log.trace(logData, 'dedupe dedupeSelf - dupes found w/ branches')
          // contextVersion has github repos -
          // query only matches repo and commit (bc same commit can live on separate branches)
          // make sure github repos branches match.
          latestDupeWithSameBranches(function (err, latestExactDupe) {
            if (err) {
              log.error(put({
                err: err
              }, logData), 'dedupe dedupeSelf latestDupeWithSameBranches error')
              return cb(err)
            }
            if (latestExactDupe &&
              dateGTE(latestExactDupe.build.started, latestDupe.build.started)) {
              log.trace(logData, 'dedupe dedupeSelf latestDupeWithSameBranches ' +
                'found latest exact dupe')
              // latest exact dupe will have exact same appCodeVersion branches
              // also compare dates with the build-equivalent dupe and make sure it is the latest
              self.remove(error.logIfErr) // delete self
              if (!latestExactDupe.owner) {
                log.warn(logData, 'dedupe dedupeSelf latestDupeWithSameBranches ' +
                  'found latest exact dupe !owner')
                var msg = 'latestDupe context version owner is null after exact dedupe'
                error.log(Boom.badImplementation(msg, { cv: latestDupe }))
              }
              cb(null, latestExactDupe)
            } else {
              log.trace(logData, 'dedupe dedupeSelf latestDupeWithSameBranches no dupe found')
              // no exact dupe found (repos and commits matched but branches didnt),
              // or exact dupe was not the absolute latest build we have with that state (acv, icv)
              // NOTE: Rely on "dedupeBuild" method called later on to handle this dedupe case
              cb(null, self)
            }
          })
        }
      }
    })
  }
  function latestDupeWithSameBranches (cb) {
    query.$and.map(function (acvQuery, i) {
      if (acvQuery.appCodeVersions.$elemMatch) {
        acvQuery.appCodeVersions.$elemMatch.lowerBranch =
          self.appCodeVersions[i].lowerBranch
      }
      return acvQuery
    })
    ContextVersion.find(query, allFields, opts, function (err, exactDupes) {
      if (err) { return cb(err) }
      cb(null, exactDupes[0])
    })
  }
}

/**
 * set context version docker image builder running information
 * @param {object}   opts:           should container following
 *                     buildId: contextVersion.build._id
 *                     dockerContainer: image builder container id
 *                     dockerTag: tag of image which context version is associated
 * @param {Function} cb              callback
 */
ContextVersionSchema.statics.updateContainerByBuildId = function (opts, cb) {
  var update = {
    $set: {
      'build.dockerContainer': opts.buildContainerId,
      'build.dockerTag': opts.tag
    }
  }
  opts.buildId = toObjectId(opts.buildId)
  ContextVersion.updateBy('build._id', opts.buildId, update, { multi: true }, cb)
}

/**
 * update context version to be completed
 * @param {string}   dockerContainer - container id of image builder associted with context version
 * @param {Object}   dockerInfo - container id of image builder associted with context version
 * @param {string}   dockerInfo.dockerHost - docker host where container came from
 * @param {function} cb - callback
 */
ContextVersionSchema.statics.updateBuildCompletedByContainer = function (dockerContainer, dockerInfo, cb) {
  log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildCompletedByContainer')
  var required = ['log', 'failed']
  // The docker image is only required if the build succeeded
  if (!dockerInfo.failed) {
    required.push('dockerImage')
  }
  required.every(function (key) {
    if (!exists(dockerInfo[key])) {
      cb(Boom.badRequest('ContextVersion requires ' + key))
      return false
    }
    return true
  })

  var update = {
    $set: {
      'dockerHost': dockerInfo.dockerHost,
      'build.completed': Date.now(),
      'build.log': dockerInfo.log,
      'build.failed': dockerInfo.failed
    }
  }
  var errorMessage = keypather.get(dockerInfo, 'error.message')
  if (errorMessage) {
    update.$set['error.message'] = errorMessage
  }
  if (!dockerInfo.failed) {
    update.$set['build.dockerImage'] = dockerInfo.dockerImage
  }
  log.trace({
    tx: true,
    update: update
  }, 'updateBuildCompletedByContainer: update data')
  var opts = { multi: true }
  ContextVersion.updateBy('build.dockerContainer', dockerContainer, update, opts, function (err) {
    if (err) { return cb(err) }
    // emit completed event for each cv
    ContextVersion.findBy('build.dockerContainer', dockerContainer, function (err, versions) {
      if (err) { return cb(err) }
      versions.forEach(emitIfCompleted)
      cb(err, versions)
    })
  })
}

/**
 * update context versions build.error w/ matching build.id
 * @param  {string}   buildId  build._id to query contextVersions by
 * @param  {error}    err      build error
 * @param  {Function} cb       callback
 */
ContextVersionSchema.statics.updateBuildErrorByBuildId = function (buildId, err, cb) {
  log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildErrorByBuildId')
  var now = Date.now()
  buildId = toObjectId(buildId)
  var dockerLog = keypather.get(err, 'data.docker.log') || ''
  var update = {
    $set: {
      'build.completed': now,
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': dockerLog,
      'build.failed': true
    }
  }
  var opts = {
    multi: true
  }
  ContextVersion.updateBy('build._id', buildId, update, opts, function (err) {
    if (err) { return cb(err) }
    // emit completed event for each cv
    ContextVersion.findBy('build._id', buildId, function (err, versions) {
      if (err) { return cb(err) }
      versions.forEach(emitIfCompleted)
      cb(err, versions)
    })
  })
}

/**
 * update context versions build.error w/ matching build.id
 * @param  {string}   dockerContainer  build.dockerContainer to query contextVersions by
 * @param  {error}    err     build error
 * @param  {Function} cb      callback
 */
ContextVersionSchema.statics.updateBuildErrorByContainer = function (dockerContainer, err, cb) {
  log.info({tx: true}, 'ContextVersionSchema.statics.updateBuildErrorByContainer')
  var now = Date.now()
  var dockerLog = keypather.get(err, 'data.docker.log') || []
  var update = {
    $set: {
      'build.completed': now,
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': dockerLog,
      'build.failed': true
    }
  }
  var opts = {
    multi: true
  }
  ContextVersion.updateBy('build.dockerContainer', dockerContainer, update, opts, function (err) {
    if (err) { return cb(err) }
    // emit completed event for each cv
    ContextVersion.findBy('build.dockerContainer', dockerContainer, function (err, versions) {
      if (err) { return cb(err) }
      versions.forEach(emitIfCompleted)
      cb(err, versions)
    })
  })
}

ContextVersionSchema.statics.addGithubRepoToVersion = function (user, contextVersionId, repoInfo, cb) {
  // order of operations:
  // - find contextVersionId, check to make sure it doesn't have the repo yet (409 otherwise), and
  //   add the new repo to it (atomically)
  // - add the hook through github (pass error if we come to one)
  // - if failed to add hook, revert change in mongo
  var githubToken = user.accounts.github.accessToken
  var lowerRepo = repoInfo.repo.toLowerCase()
  var github = new Github({ token: githubToken })
  ContextVersion.findOneAndUpdate({
    _id: contextVersionId,
    'appCodeVersions.lowerRepo': { $ne: lowerRepo }
  }, {
    $push: { appCodeVersions: repoInfo }
  }, function (err, doc) {
    // this is our check to make sure the repo isn't added to this context version yet
    if (err) {
      cb(err)
    } else if (!doc) {
      cb(Boom.conflict('Github Repository already added'))
    } else {
      async.waterfall([
        github.getRepo.bind(github, repoInfo.repo),
        function (repo, headers, cb) {
          if (isFunction(headers)) {
            // sometimes this is funky, but this check is fine
            cb = headers
          }
          github.createRepoHookIfNotAlready(repoInfo.repo, function (err) {
            cb(err, repo)
          })
        },
        function (repo, cb) {
          github.addDeployKeyIfNotAlready(repoInfo.repo, function (err, deployKeys) {
            cb(err, deployKeys, repo)
          })
        }
      ], function (updateErr, deployKeys, repo) {
        if (updateErr) {
          // we failed to talk with github - remove entry
          // remove entry in appCodeVersions
          ContextVersion.findOneAndUpdate({
            _id: contextVersionId
          }, {
            $pull: {
              appCodeVersions: {
                lowerRepo: lowerRepo
              }
            }
          }, function (err, doc) {
            if (updateErr || err) {
              cb(updateErr || err)
            } else if (!doc) {
              cb(Boom.badImplementation('could not remove the repo from your project'))
            } else { cb(null) }
          })
        } else {
          // update the database with the keys that were added, and gogogo!
          ContextVersion.findOneAndUpdate({
            _id: contextVersionId,
            'appCodeVersions.lowerRepo': lowerRepo
          }, {
            $set: {
              'appCodeVersions.$.defaultBranch': repo.default_branch,
              'appCodeVersions.$.publicKey': deployKeys.publicKey,
              'appCodeVersions.$.privateKey': deployKeys.privateKey
            }
          }, function (err, doc) {
            // we're all done with the updated. if everything went well, we're in business!
            if (err) {
              cb(err)
            } else if (!doc) {
              cb(Boom.badImplementation('could not save deploy keys'))
            } else {
              cb(null)
            }
          })
        }
      })
    }
  })
}

ContextVersionSchema.methods.pullAppCodeVersion = function (appCodeVersionId, cb) {
  log.trace({
    tx: true,
    appCodeVersionId: appCodeVersionId
  }, 'pullAppCodeVersion')
  var contextVersion = this
  var found =
  find(contextVersion.appCodeVersions, hasKeypaths({
    '_id.toString()': appCodeVersionId.toString()
  }))
  if (!found) {
    cb(Boom.notFound('AppCodeVersion with _id "' + appCodeVersionId + '" not found'))
  } else {
    contextVersion.update({
      $pull: {
        appCodeVersions: {
          _id: appCodeVersionId
        }
      }
    }, cb)
  }
}
/**
 * returns the main appCodeVersion
 * @param  {object} appCodeVersions CV's appCodeVersions array
 * @return {object} main appCodeVersion or null if not exist
 */
ContextVersionSchema.statics.getMainAppCodeVersion = function (appCodeVersions) {
  log.trace({
    tx: true,
    appCodeVersions: appCodeVersions
  }, 'ContextVersionSchema.statics.getMainAppCodeVersion')
  if (!appCodeVersions) { return null }
  return find(appCodeVersions, function (appCodeVersion) {
    return !appCodeVersion.additionalRepo
  })
}
/**
 * returns the main appCodeVersion
 * @return {object} main appCodeVersion
 */
ContextVersionSchema.methods.getMainAppCodeVersion = function () {
  log.trace({
    tx: true
  }, 'ContextVersionSchema.methods.getMainAppCodeVersion')
  return ContextVersion.getMainAppCodeVersion(this.appCodeVersions)
}

ContextVersionSchema.methods.modifyAppCodeVersionWithLatestCommit = function (user, cb) {
  var logData = {
    tx: true,
    user: user
  }
  log.info(logData, 'modifyAppCodeVersionWithLatestCommit')
  var self = this
  var updatableAdditionalRepos = this.appCodeVersions.filter(function (acv) {
    return acv.additionalRepo && acv.useLatest
  })
  // if nothing to update - just return current contextVersion
  if (!updatableAdditionalRepos || updatableAdditionalRepos.length === 0) {
    return cb(null, this)
  }
  // This token might belong to HelloRunnable since this API call might be
  // called by the worker. It might not have access to the branch
  var githubToken = keypather.get(user, 'accounts.github.accessToken')
  async.each(updatableAdditionalRepos, function (acv, eachCb) {
    var github = new Github({ token: githubToken })
    log.trace(
      put({ repo: acv.repo, branch: acv.branch }, logData),
      'modifyAppCodeVersionWithLatestCommit getBranch'
    )
    github.getBranch(acv.repo, acv.branch, function (err, branch) {
      if (err) {
        log.error(
          put({ repo: acv.repo, branch: acv.branch, err: err }, logData),
          'modifyAppCodeVersionWithLatestCommit getBranch failed. Does this user have access to this repo?'
        )
        return eachCb(err)
      }
      var commit = keypather.get(branch, 'commit.sha')
      self.modifyAppCodeVersion(acv._id, { commit: commit }, eachCb)
    })
  }, function (err) {
    if (err) {
      return cb(err)
    }
    // we need to refetch model since it was changed
    ContextVersion.findById(self._id, cb)
  })
}

ContextVersionSchema.methods.modifyAppCodeVersion = function (appCodeVersionId, data, cb) {
  log.trace({
    tx: true,
    appCodeVersionId: appCodeVersionId,
    data: data
  }, 'ContextVersionSchema.methods.modifyAppCodeVersion')
  var contextVersion = this
  var query = {
    _id: contextVersion._id,
    'appCodeVersions._id': appCodeVersionId
  }
  var update = {
    $set: {}
  }
  if (data.branch) {
    update.$set['appCodeVersions.$.branch'] = data.branch
    update.$set['appCodeVersions.$.lowerBranch'] = data.branch.toLowerCase()
  }
  if (data.commit) {
    update.$set['appCodeVersions.$.commit'] = data.commit
  }
  if (data.transformRules) {
    update.$set['appCodeVersions.$.transformRules'] = data.transformRules
  }

  if (data.useLatest === true || data.useLatest === false) {
    update.$set['appCodeVersions.$.useLatest'] = data.useLatest
  }
  ContextVersion.findOneAndUpdate(query, update, function (err, contextVersion) {
    if (err) {
      cb(err)
    } else if (!contextVersion) {
      cb(Boom.notFound('AppCodeVersion with _id "' + appCodeVersionId + '" not found'))
    } else {
      cb(null, contextVersion)
    }
  })
}

ContextVersionSchema.statics.modifyAppCodeVersionByRepo = function (versionId, repo, branch, commit, cb) {
  log.trace({
    tx: true,
    versionId: versionId,
    repo: repo,
    branch: branch,
    commit: commit
  }, 'ContextVersionSchema.statics.modifyAppCodeVersionByRepo ')
  ContextVersion.findOneAndUpdate({
    _id: versionId,
    'appCodeVersions.lowerRepo': repo.toLowerCase()
  }, {
    $set: {
      'appCodeVersions.$.branch': branch,
      'appCodeVersions.$.lowerBranch': branch.toLowerCase(),
      'appCodeVersions.$.commit': commit
    }
  }, cb)
}

ContextVersionSchema.statics.findAllRepos = function (cb) {
  ContextVersion.aggregate([
    {
      $unwind: '$appCodeVersions'
    },
    {
      $group: {
        _id: '$appCodeVersions.lowerRepo',
        creators: {
          $addToSet: '$createdBy.github'
        }
      }
    }
  ], cb)
}

/**
 * Finds a completed duplicate of the context version.
 * @param {function} cb Callback to execute with the result of the find.
 */
ContextVersionSchema.methods.findCompletedDupe = function (cb) {
  var self = this
  var query = ContextVersion.addAppCodeVersionQuery(self, {
    'build.completed': { $exists: true },
    'build.hash': self.build.hash,
    'build._id': { $ne: self.build._id } // ignore self
  })
  if (exists(self.advanced)) {
    query.advanced = self.advanced
  }
  var opts = {
    sort: '-build.started',
    limit: 1
  }
  ContextVersion.find(query, null, opts, function (err, duplicates) {
    cb(err, duplicates[0])
  })
}

/**
 * Finds the oldest pending duplicate build for the context version (excluding
 * the context version itself).
 * @param {function} cb Callback to execute after the duplicate pending builds
 *   have been determined.
 */
ContextVersionSchema.methods.findPendingDupe = function (cb) {
  var logData = { tx: true }
  var self = this
  var query = {
    'build.completed': { $exists: false },
    'build.hash': self.build.hash,
    'build._id': { $ne: self.build._id } // ignore self
  }
  if (exists(self.advanced)) {
    query.advanced = self.advanced
  }
  query = ContextVersion.addAppCodeVersionQuery(self, query)
  var opts = {
    sort: 'build.started',
    limit: 1
  }
  log.info(put({ query: query, opts: opts }, logData), 'contextVersion.methods.findPendingDupe')
  ContextVersion.find(query, null, opts, function (err, duplicates) {
    if (err) {
      log.error(put({ err: err }, logData), 'findPendingDupe: find error')
      return cb(err)
    }
    var oldestPending = duplicates[0]
    log.trace(put({
      oldestPending: oldestPending ? oldestPending._id : undefined
    }, logData), 'findPendingDupe: find success')
    if (
      oldestPending &&
      dateLTE(self.build.started, oldestPending.build.started)
    ) {
      // self is the winner, don't report it
      cb(null, null)
    } else {
      // use oldest pending dupe (might be null)
      cb(null, oldestPending)
    }
  })
}

/**
 * Sets the build hash for the context version.
 * @param {string} hash The hash to set.
 * @param {function} cb The callback to execute once the hash has been set.
 */
ContextVersionSchema.methods.updateBuildHash = function (hash, cb) {
  log.info({ hash: hash, tx: true }, 'contextVersion: setHash')
  var self = this
  var query = {
    $set: {
      'build.hash': hash
    }
  }
  self.update(query, function (err) {
    if (err) {
      log.error({ err: err, tx: true }, 'contextVersion: setHash error')
      return cb(err)
    }
    log.trace({ hash: hash, tx: true }, 'contextVersion: setHash success')
    self.build.hash = hash
    cb()
  })
}

/**
 * looks for build from contextVersions with the same hash and
 * appcode then updates build if dupe
 * @return contextVersion self
 */
ContextVersionSchema.methods.dedupeBuild = function (callback) {
  var logData = {
    tx: true
  }
  log.info(logData, 'ContextVersionSchema.methods.dedupeBuild')
  var self = this
  var icvId = self.infraCodeVersion
  async.waterfall([
    InfraCodeVersion.findByIdAndGetHash.bind(InfraCodeVersion, icvId),
    self.updateBuildHash.bind(self), // hash should be set here to dedupe multiple started builds
    self.findPendingDupe.bind(self),
    findCompletedDupe, // must be done after pending due to race
    checkOwnerMatch,
    replaceIfDupe
  ], callback)

  // find youngest completed builds, (excluding self) which match hash and app-code
  function findCompletedDupe (pendingDupe, cb) {
    log.info(logData, 'dedupeBuild: findCompletedDupe')

    // always use oldest pending duplicate if it exists
    if (pendingDupe) {
      log.info(
        logData,
        'dedupeBuild: findCompletedDupe: skipping, using pending duplicate'
      )
      return cb(null, pendingDupe)
    }

    self.findCompletedDupe(function (err, completedDupe) {
      if (err) {
        log.info(
          put({err: err}, logData),
          'dedupeBuild: findCompletedDupe: failed to find dupe'
        )
        return cb(err)
      }
      cb(null, completedDupe)
    })
  }

  // Check to ensure that the owners are the same on the duplicate
  function checkOwnerMatch (dupe, cb) {
    log.info(logData, 'dedupeBuild: checkOwnerMatch')
    if (
      (isObject(dupe) && isObject(dupe.owner)) &&
      (self.owner.github !== dupe.owner.github)
    ) {
      log.info(logData, 'dedupeBuild: owners do not match, stopping dedupe')
      cb(null, null)
    } else {
      cb(null, dupe)
    }
  }

  function replaceIfDupe (dupe, cb) {
    log.info(logData, 'dedupeBuild: replaceIfDupe')
    if (dupe) { // dupe found
      log.info(logData, 'dedupeBuild: replaceIfDupe dupe found')
      dogstatsd.increment('api.contextVersion.build.deduped')
      self.copyBuildFromContextVersion(dupe, cb)
    } else {
      log.info(logData, 'dedupeBuild: replaceIfDupe no dupe')
      dogstatsd.increment('api.contextVersion.build.noDupe')
      cb(null, self)
    }
  }
}

ContextVersionSchema.methods.copyBuildFromContextVersion = function (dupeCv, cb) {
  var logData = {
    tx: true
  }
  var self = this // cv to dedupe build.
  var $set = getSetForDedupe(this, dupeCv)
  log.info(put({
    dupeCv: dupeCv._id,
    update: $set
  }, logData), 'ContextVersionSchema.methods.copyBuildFromContextVersion')
  self.modifySelf({ $set: $set }, function (err, dedupedCv) {
    // dedupedCv is updated version of self
    if (err) {
      log.error(put({
        err: err
      }, logData), 'copyBuildFromContextVersion: self.modifySelf error')
      return cb(err)
    }
    if (!dupeCv.build.completed) {
      log.trace(put({
        dedupedCv: dedupedCv._id
      }, logData), 'copyBuildFromContextVersion: !dupeCv.build.completed')
      // check for race condition (read checkIfDedupedShouldBeUpdated's doc)
      checkIfDedupedShouldBeUpdated(dupeCv, dedupedCv, cb)
    } else {
      log.trace(put({
        dedupedCv: dedupedCv._id
      }, logData), 'copyBuildFromContextVersion: dupeCv.build.completed emit')
      // since dupeCv was completed, dedupedCv was marked completed when the build was copied
      // emit deduped build_ completed event
      emitIfCompleted(dedupedCv)
      cb(null, dedupedCv)
    }
  })
}
/**
 * check if dedupe was never marked as completed due to race condition
 * @param  {ContextVersion}   dupeCv    duplicate context version found
 * @param  {ContextVersion}   dedupedCv context version who's build was deduped
 * @param  {Function}         cb        callback
 * If contextVersion.build was not completed it could have changed
 *     after we originally fetched it.
 * Fetch it again. If dupe has changed, and dedupe is still not
 *     we must copy the dedupe again (to ensure it is marked as completed)
 *     bc of a race condition.
 */
function checkIfDedupedShouldBeUpdated (dupeCv, dedupedCv, cb) {
  var logData = {
    tx: true,
    dupeCv: dupeCv._id,
    dedupedCv: dedupedCv._id
  }
  log.info(logData, 'checkIfDedupedShouldBeUpdated')

  dupeCv.findSelf({'build.log': 0}, function (err, foundDupeCv) {
    if (err) {
      log.trace(put({ err: err }, logData), 'checkIfDedupedShouldBeUpdated: findSelf')
      return cb(err)
    }

    // if there was no change in dupeCv and dedupedCv then wait for completion
    var hasNotChanged = deepEqual(foundDupeCv.build, dedupedCv.build)
    if (hasNotChanged) {
      log.trace(put({
        foundDupeCv: foundDupeCv._id
      }, logData), 'checkIfDedupedShouldBeUpdated: dupe has not changed')
      // dupe and deduped will be marked as completed when dupe finishes
      return cb(null, dedupedCv)
    }
    // dupe changed after the last time we fetched it
    // update deduped if it is not marked as completed
    // (happens if dedupe build occurred after dupe completed)
    var query = {
      _id: dedupedCv._id,
      'build.completed': { $exists: false } // incomplete
    }
    var $set = getSetForDedupe(dedupedCv, foundDupeCv)
    log.trace(put({
      query: query,
      update: $set,
      foundDupeCv: foundDupeCv._id
    }, logData), 'checkIfDedupedShouldBeUpdated: dupe has changed')
    ContextVersion.findOneAndUpdate(query, { $set: $set }, function (err, updatedDedupedCv) {
      if (err) {
        log.trace(put({ err: err }, logData), 'checkIfDedupedShouldBeUpdated: findOneAndUpdate error')
        return cb(err)
      }

      if (!updatedDedupedCv) {
        log.trace(put({
          updatedDedupedCv: updatedDedupedCv._id
        }, logData), 'checkIfDedupedShouldBeUpdated: deduped cv was already complete')
        return cb(null, dedupedCv)
      }
      log.trace(put({
        updatedDedupedCv: updatedDedupedCv._id
      }, logData), 'checkIfDedupedShouldBeUpdated: deduped cv was not complete and was just marked as completed')
      emitIfCompleted(updatedDedupedCv)
      cb(null, updatedDedupedCv)
    })
  })
}

ContextVersionSchema.statics.findByBuildId = function (buildId, cb) {
  // there may be multiple builds with the same build id!
  buildId = toObjectId(buildId)
  this.find({
    'build._id': buildId
  }, cb)
}

/**
 * Mark all the context versions as dockRemoved on the particular dockerHost
 * @param {String} dockerHost format: http://10.0.0.1:4242
 * @param {Function} cb (err)
 */
ContextVersionSchema.statics.markDockRemovedByDockerHost = function (dockerHost, cb) {
  var logData = {
    tx: true,
    dockerHost: dockerHost
  }
  log.info(logData, 'ContextVersionSchema.statics.markDockRemovedByDockerHost')
  ContextVersion.update(
    { dockerHost: dockerHost },
    { $set: { dockRemoved: true } },
    { multi: true },
    cb
  )
}

/**
 * clear dockerHost on this instance
 * @param  {Function} cb         (err, instance)
 */
ContextVersionSchema.methods.clearDockerHost = function (cb) {
  var logData = {
    tx: true,
    id: this._id
  }
  log.trace(logData, 'ContextVersionSchema.methods.clearDockerHost')
  ContextVersion.findOneAndUpdate({
    _id: this._id
  }, {
    'dockerHost': null
  }, function (err, cv) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'ContextVersionSchema.methods.clearDockerHost findOneAndUpdate error')
      return cb(err)
    }
    log.trace(logData, 'ContextVersionSchema.methods.clearDockerHost findOneAndUpdate success')
    cb(null, cv)
  })
}
/**
 * Set the dockRemoved flag to false if dockRemoved was true.
 * @param {ObjectId} cvId - ContextVersion id to recover
 * @param {function} cb
 */
ContextVersionSchema.statics.recover = function (cvId, cb) {
  var logData = {
    tx: true,
    id: cvId
  }
  log.trace(logData, 'ContextVersion.statics.recover')
  var $query = {
    '_id': cvId,
    'dockRemoved': true
  }
  var $update = {
    $set: {
      dockRemoved: false
    }
  }
  ContextVersion.findOneAndUpdate($query, $update, cb)
}

/**
 * Returns the document of this CV, but with the virtual properties added.  This can be used in
 * place of toJSONing everything
 * @returns {Object} $set-able version of this CV
 */
ContextVersionSchema.methods.getSubdoc = function () {
  var cvDoc = this._doc
  // Without saving these 2 properties, a lot of the instance fetches will fail
  cvDoc.id = this._id.toString()
  cvDoc.build.duration = this.build.duration
  return cvDoc
}

/**
 * get memory limit to assign to this cv's user container
 * @returns {String} memory in bytes to limit to
 */
ContextVersionSchema.methods.getUserContainerMemoryLimit = function () {
  var logData = {
    tx: true,
    _id: this._id,
    userContainerMemoryInBytes: this.userContainerMemoryInBytes
  }
  log.info(logData, 'ContextVersionSchema.statics.getUserContainerMemoryLimit')

  if (this.userContainerMemoryInBytes) {
    log.trace(logData, 'getUserContainerMemoryLimit - Custom container memory overridden.')
    return this.userContainerMemoryInBytes
  }

  var isRepo = !!this.getMainAppCodeVersion()

  var memoryAmount = isRepo
    ? process.env.CONTAINER_REPO_MEMORY_LIMIT_BYTES
    : process.env.CONTAINER_NON_REPO_MEMORY_LIMIT_BYTES
  log.trace(put({
    isRepo: isRepo,
    memoryAmount: memoryAmount
  }, logData), 'getUserContainerMemoryLimit - Using default values')
  return memoryAmount
}

/**
 * contains all cv states
 * @type {Object}
 */
ContextVersionSchema.statics.states = {
  buildStarted: 'build_started',
  buildStarting: 'build_starting'
}

ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema)
Promise.promisifyAll(ContextVersion)
Promise.promisifyAll(ContextVersion.prototype)

function getSetForDedupe (deduped, dupe) {
  // If we don't use the doc, pick will grab a ton of functions and completely mess this up
  dupe = (dupe._doc) ? dupe._doc : dupe
  var dupeCopyFields = ['build', 'dockerHost', 'containerId', 'state']
  var $set = pick(dupe, dupeCopyFields)
  // advanced works differently than dupeCopyFields.
  // advanced should be false if the dupe or the cv is marked false.
  // when advanced is false it results in a better user experience,
  // as we can show more information about the instance's image.
  $set.advanced = !(dupe.advanced === false || deduped.advanced === false)

  return $set
}
