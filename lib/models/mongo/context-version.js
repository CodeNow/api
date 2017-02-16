'use strict'

const async = require('async')
const BaseSchema = require('models/mongo/schemas/base')
const Boom = require('dat-middleware').Boom
const exists = require('101/exists')
const find = require('101/find')
const hasKeypaths = require('101/has-keypaths')
const isObject = require('101/is-object')
const isString = require('101/is-string')
const keypather = require('keypather')()
const moment = require('moment')
const mongoose = require('mongoose')
const noop = require('101/noop')
const pick = require('101/pick')
const Promise = require('bluebird')

const monitorDog = require('monitor-dog')
const error = require('error')
const Github = require('models/apis/github')
const InfraCodeVersion = require('models/mongo/infra-code-version')
const logger = require('logger').child({ module: 'ContextVersion' })
const messenger = require('socket/messenger')
const monitor = require('monitor-dog')
const objectId = require('objectid')
const rabbitMQ = require('models/rabbitmq')

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
  var log = logger.child({
    contextVersion: cv
  })
  log.trace('emitIfCompleted')
  if (cv.build.completed) {
    log.trace('emitIfCompleted completed true')
    messenger.emitContextVersionUpdate(cv, 'build_completed')
  } else {
    log.trace('emitIfCompleted completed false')
  }
}

var ContextVersionSchema = require('models/mongo/schemas/context-version')

/**
 * @param  {String} contextVersionId
 * @return {ContextVersion}
 * @throws {ContextVersion.NotFoundError} if not found
 */
ContextVersionSchema.statics.findContextVersionById = (contextVersionId) => {
  return ContextVersion.findAndAssert({
    _id: contextVersionId
  })
}

/**
 * @param  {Object} query mongo format query
 * @return {ContextVersion}
 * @throws {ContextVersion.NotFoundError} if not found
 */
ContextVersionSchema.statics.findAndAssert = (query) => {
  return ContextVersion.findOneAsync(query)
  .tap((contextVersion) => {
    if (!contextVersion) {
      logger.error({ query }, 'failed to find context version')
      throw new ContextVersion.NotFoundError(query)
    }
  })
}

/**
 * @param  {SessionUser} sessionUser
 * @param  {String} repoName
 * @return {Object}
 * @return {String} .repo
 * @return {String} .lowerRepo
 * @return {String} .commit
 * @return {String} .branch
 * @return {String} .publicKey
 * @return {String} .privateKey
 */
ContextVersionSchema.statics.createAppcodeVersion = function (sessionUser, repoName) {
  const token = sessionUser.accounts.github.accessToken
  const github = new Github({ token })
  return github.getRepoAsync(repoName)
  .then((githubRepoInfo) => {
    const defaultBranch = githubRepoInfo.default_branch

    return Promise.props({
      branchInfo: github.getBranchAsync(repoName, defaultBranch),
      keys: github.createHooksAndKeys(repoName)
    })
    .then((githubInfo) => {
      return {
        repo: repoName,
        lowerRepo: repoName.toLowerCase(),
        commit: githubInfo.branchInfo.commit.sha,
        branch: defaultBranch,
        publicKey: githubInfo.keys.publicKey,
        privateKey: githubInfo.keys.privateKey
      }
    })
  })
}

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
  if (contextVersion.context) {
    // Necessary because of multiple instances with same repo
    query.context = objectId(contextVersion.context)
  }
  if (contextVersion.appCodeVersions.length) {
    query.$and = query.$and || []
    contextVersion.appCodeVersions.forEach(function (acv) {
      query.$and.push({
        appCodeVersions: {
          $elemMatch: {
            lowerRepo: acv.lowerRepo,
            commit: acv.commit
          }
        }
      })
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
  var log = logger.child({
    contextVersion: this,
    logLength: logs.length,
    streamId: stream.id
  })
  log.trace('writeLogsToPrimusStream')
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
    log.trace('writeLogsToPrimusStream finished')
    timer.stop()
    stream.end()
    if (err) {
      throw err
    }
  })
}

/**
 * @param  {Object} props
 *         {String} props.context
 *         {String} props.createdBy.github
 *         {String} props.owner.github
 *         {String} props.advanced
 *         {Array}  props.appCodeVersions
 * @param  {String} dockerFileContent
 * @param  {Object} infraCodeVersionProps
 * @param  {ObjectId} infraCodeVersionProps.parent
 * @param  {Boolean} infraCodeVersionProps.edited
 * @return {ContextVersion}
 */
ContextVersionSchema.statics.createWithDockerFileContent = function (props, dockerFileContent, infraCodeVersionProps) {
  const log = logger.child(Object.assign({
    method: 'createWithDockerFileContent',
    dockerFileContent,
    infraCodeVersionProps
  }, props))
  log.info('called')
  const infraCodeVersionOpts = Object.assign({
    context: props.context
  }, infraCodeVersionProps || {})
  log.info({ infraCodeVersionOpts }, 'creating new infraCodeVersion')
  const infraCodeVersion = new InfraCodeVersion(infraCodeVersionOpts)
  return infraCodeVersion.initWithDefaultsAsync()
  .then((newInfraCodeVersion) => {
    return newInfraCodeVersion.saveAsync()
  })
  .then((savedInfraCodeVersion) => {
    return savedInfraCodeVersion.createFsAsync({
      name: 'Dockerfile',
      path: '/',
      body: dockerFileContent
    })
    .then(() => {
      const cvOpts = Object.assign({}, props, {
        infraCodeVersion: savedInfraCodeVersion._id
      })
      log.info({ opts: cvOpts }, 'saving contextVersion')
      const contextVersion = new ContextVersion(cvOpts)
      return contextVersion.saveAsync()
    })
    .tap((savedContextVersion) => {
      log.info({ contextVersion: savedContextVersion }, 'saved contextVersion')
    })
  })
}

/**
 * @param  {Object} props
 *         {String} props.context
 *         {String} props.createdBy.github
 *         {String} props.owner.github
 *         {String} props.advanced
 *         {Array}  props.appCodeVersions
 * @param  {ObjectId} infraCodeVersionProps.parent
 * @param  {Boolean} infraCodeVersionProps.edited
 * @return {ContextVersion}
 */
ContextVersionSchema.statics.createWithNewInfraCode = function (props, infraCodeVersionProps) {
  const log = logger.child(Object.assign({
    method: 'createWithNewInfraCode',
    infraCodeVersionProps
  }, props))
  log.info('called')
  const infraCodeVersionOpts = Object.assign({
    context: props.context
  }, infraCodeVersionProps || {})
  log.info({ infraCodeVersionOpts }, 'creating new infraCodeVersion')
  const infraCodeVersion = new InfraCodeVersion(infraCodeVersionOpts)
  return infraCodeVersion.initWithDefaultsAsync()
    .then((newInfraCodeVersion) => {
      return newInfraCodeVersion.saveAsync()
    })
    .then((savedInfraCodeVersion) => {
      log.info({ infraCodeVersion: savedInfraCodeVersion }, 'saved infraCodeVersion')
      const cvOpts = Object.assign({}, props, {
        infraCodeVersion: savedInfraCodeVersion._id
      })
      log.info({ opts: cvOpts }, 'saving contextVersion')
      const contextVersion = new ContextVersion(cvOpts)
      return contextVersion.saveAsync()
        .tap((savedContextVersion) => {
          log.info({ contextVersion: savedContextVersion }, 'saved contextVersion')
        })
    })
    .catch((err) => {
      log.error({ err }, 'failed to save infraCodeVersion or contextVersion')
      infraCodeVersion.bucket().removeSourceDir(noop)
      throw err
    })
}

var copyFields = [
  'advanced',
  'appCodeVersions',
  'buildDockerfilePath',
  'context',
  'dockRemoved',
  'owner',
  'userContainerMemoryInBytes'
]

/**
 * Creates a new Context Version.
 * @param {Object} user User object who will be the 'createdBy' user.
 * @param {Object} version Context Version to copy.
 * @param {Function} cb Returns the new Context Version.
 */
ContextVersionSchema.statics.createDeepCopy = function (user, version, cb) {
  const log = logger.child({
    method: 'ContextVersionSchema.statics.createDeepCopy',
    sessionUserId: keypather.get(user, 'accounts.github.id'),
    contextVersion: version
  })
  log.info('called')
  if (version.build) {
    delete version.build.log
  } else if (version._doc.build) {
    delete version._doc.build.log
  }
  version = version.toJSON ? version.toJSON() : version

  var newVersion = new ContextVersion(pick(version, copyFields))
  if (version.dockerHost) {
    newVersion.prevDockerHost = version.dockerHost
  }
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
  const log = logger.child({
    contextVersion: this,
    sessionUser: sessionUser,
    method: 'populateOwner'
  })
  log.trace('called')
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
 * @param buildProps {Object} Probably the body
 * @param cb callback
 */
ContextVersionSchema.methods.setBuildStarted = function (user, buildProps, cb) {
  if (typeof buildProps === 'function') {
    cb = buildProps
    buildProps = {}
  }
  const log = logger.child({
    contextVersion: this,
    sessionUser: user,
    buildProps,
    method: 'setBuildStarted'
  })
  log.info('called')
  var update = {}
  // FIXME: lets get rid of cv.containerId soon (now mirrors build._id)
  // - used for buildLogs (change to build._id)
  update.$set = {
    'build.started': Date.now(),
    'build.triggeredBy.github': user.accounts.github.id
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
    const infraCodeVersionId = contextVersion.infraCodeVersion
    log.info({ infraCodeVersionId }, 'search for infraCodeVersion')
    InfraCodeVersion.findById(infraCodeVersionId, function (err, infraCodeVersion) {
      if (err) { return cb(err) }
      if (!infraCodeVersion) {
        err = Boom.conflict('InfraCodeVersion could not be found', {
          contextVersion: contextVersion._id,
          infraCodeVersion: contextVersion.infraCodeVersion
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
        log.trace({
          infraCodeVersion
        }, 'infraCodeVersion was not edited, using parent instead')
        // If the current infraCodeVersion hasn't been edited, then we should set the
        // contextVersion's infraCode to its parent, and delete this one
        update.$set.infraCodeVersion = infraCodeVersion.parent
        InfraCodeVersion.removeById(infraCodeVersion._id, error.logIfErr)
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
  const log = logger.child({
    contextVersion: this,
    method: 'dedupeInfra'
  })
  log.info('called')
  var contextVersion = this
  const icvId = contextVersion.infraCodeVersion
  InfraCodeVersion.findById(icvId, function (err, icv) {
    if (err) { return cb(err) }
    if (!icv.edited) {
      contextVersion.set('infraCodeVersion', icv.parent)
      contextVersion.save(function (err) {
        if (err) { return cb(err) }
        log.info({ icvId }, 'deduped infra: use parent')
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
  const log = logger.child({
    method: 'ContextVersionSchema.methods.dedupe',
    contextVersion: this,
    started: this.started,
    infraCodeVersion: this.infraCodeVersion
  })
  log.info('called')
  var self = this
  if (!this.owner) {
    log.warn('dedupe !this.owner')
    error.log(Boom.badImplementation('context version owner is null during dedupe', { cv: this }))
  }
  if (this.started) {
    log.warn('dedupe !this.started')
    // build is already started and possibly built. no need to check for duplicate.
    return callback(null, self)
  }
  async.waterfall([
    dedupeInfra,
    dedupeSelf
  ], callback)
  var query, opts, allFields
  function dedupeInfra (cb) {
    log.info('ContextVersionSchema.methods.dedupe dedupeInfra')
    self.dedupeInfra(function (err) {
      if (err) {
        log.warn({
          err: err
        }, 'dedupe self.dedupeInfra error')
      } else {
        log.trace('dedupe self.dedupeInfra success')
      }
      cb(err)
    })
  }
  function dedupeSelf (cb) {
    log.info('ContextVersionSchema.methods.dedupe dedupeSelf')
    // ownership is essentially verified by infraCodeVersionId
    // but we should make this more secure
    query = {
      'build.failed': { $ne: true },
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
        log.error({
          err: err
        }, 'dedupe dedupeSelf ContextVersion.find error')
        return cb(err)
      }
      var latestDupe = duplicates[0]
      if (!latestDupe) {
        log.trace('dedupe dedupeSelf no dupes found')
        // no dupes found
        return cb(null, self)
      } else if (latestDupe.build.completed && keypather.get(latestDupe, 'build.failed')) {
        // Build container failed, do not dedupe
        log.trace('dedupe dedupeSelf build container failed, do not dedupe')
        return cb(null, self)
      } else { // dupes were found
        log.trace('dedupe dedupeSelf - dupes found')
        if (self.appCodeVersions.length === 0) {
          log.trace('dedupe dedupeSelf - dupes found + no branches')
          // No github repos, so no chance for branch to
          // latestDupe is latestExactDupe in this case
          self.remove(error.logIfErr) // delete self
          if (!latestDupe.owner) {
            var msg = 'latestDupe context version owner is null after dedupe'
            error.log(Boom.badImplementation(msg, { cv: latestDupe }))
          }
          return cb(null, latestDupe)
        } else {
          log.trace('dedupe dedupeSelf - dupes found w/ branches')
          // contextVersion has github repos -
          // query only matches repo and commit (bc same commit can live on separate branches)
          // make sure github repos branches match.
          latestDupeWithSameBranches(function (err, latestExactDupe) {
            if (err) {
              log.error({
                err: err
              }, 'dedupe dedupeSelf latestDupeWithSameBranches error')
              return cb(err)
            }
            if (latestExactDupe &&
              dateGTE(latestExactDupe.build.started, latestDupe.build.started)) {
              log.trace('dedupe dedupeSelf latestDupeWithSameBranches ' +
                'found latest exact dupe')
              // latest exact dupe will have exact same appCodeVersion branches
              // also compare dates with the build-equivalent dupe and make sure it is the latest
              self.remove(error.logIfErr) // delete self
              if (!latestExactDupe.owner) {
                log.warn('dedupe dedupeSelf latestDupeWithSameBranches ' +
                  'found latest exact dupe !owner')
                var msg = 'latestDupe context version owner is null after exact dedupe'
                error.log(Boom.badImplementation(msg, { cv: latestDupe }))
              }
              return cb(null, latestExactDupe)
            } else {
              log.trace('dedupe dedupeSelf latestDupeWithSameBranches no dupe found')
              // no exact dupe found (repos and commits matched but branches didnt),
              // or exact dupe was not the absolute latest build we have with that state (acv, icv)
              // NOTE: Rely on "dedupeBuild" method called later on to handle this dedupe case
              return cb(null, self)
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
 * find context version in creating state
 * @param  {String}  contextVersionId id of cv to find
 * @returns  {Promise}
 * @resolves  {Instance}  when cv in creating state found
 * @throws  {ContextVersion.NotFoundError}  If cv with contextVersionId not found
 * @throws  {ContextVersion.IncorrectStateError} If cv not in creating state
 */
ContextVersionSchema.statics.findOneCreating = (contextVersionId) => {
  var log = logger.child({
    contextVersionId,
    method: 'findOneCreating'
  })
  log.info('called')
  var query = {
    _id: contextVersionId
  }
  return ContextVersion.findAndAssert(query)
    .tap((contextVersion) => {
      // state should not exist here.
      if (contextVersion.state) {
        throw new ContextVersion.IncorrectStateError('creating', contextVersion)
      }
    })
}

/**
 * @param {string}   buildId - build id associated with context version
 * @param {string}   errorMessage - runnable error message (optional)
 * @return {Promise}
 */
ContextVersionSchema.statics.updateAndGetFailedBuild = (buildId, errorMessage) => {
  var log = logger.child({
    buildId: buildId,
    method: 'updateWithFailedBuild'
  })
  log.info('updateWithFailedBuild called')

  var update = {
    $set: {
      'build.completed': Date.now(),
      'build.failed': true,
      'state': ContextVersion.states.buildErrored
    }
  }

  // if there is a runnable error we will have an error message
  if (errorMessage) {
    update.$set['build.error.message'] = errorMessage
  }

  return ContextVersion._updateByBuildIdAndEmit(buildId, update)
}

/**
 * @param {string}   buildId - build id associated with context version
 * @return {Promise}
 */
ContextVersionSchema.statics.updateAndGetSuccessfulBuild = (buildId) => {
  var log = logger.child({
    buildId: buildId,
    method: 'updateAndGetSuccessfulBuild'
  })
  log.info('updateAndGetSuccessfulBuild called')

  var update = {
    $set: {
      'build.completed': Date.now(),
      'build.failed': false,
      'state': ContextVersion.states.buildSucceeded
    }
  }

  return ContextVersion._updateByBuildIdAndEmit(buildId, update)
}

ContextVersionSchema.statics._updateByBuildIdAndEmit = (buildId, update) => {
  return ContextVersion.updateByAsync('build._id', buildId, update, { multi: true })
    .then(() => {
      return ContextVersion.findByAsync('build._id', buildId)
    })
    .each(emitIfCompleted)
}

/**
 * order of operations:
 * - find contextVersionId, check to make sure it doesn't have the repo yet (409 otherwise), and
 *   add the new repo to it (atomically)
 * - add the hook through github (pass error if we come to one)
 * - if failed to add hook, revert change in mongo
 * @param {SessionUser} sessionUser
 * @param {String} contextVersionId
 * @param {Object} repoInfo
 * @param {String} repoInfo.commit
 * @param {String} repoInfo.branch
 * @param {String} repoInfo.repo
 */
ContextVersionSchema.statics.addGithubRepoToVersion = function (sessionUser, contextVersionId, repoInfo) {
  var token = sessionUser.accounts.github.accessToken
  var lowerRepo = repoInfo.repo.toLowerCase()
  var github = new Github({ token })
  return ContextVersion.findOneAndUpdateAsync({
    _id: contextVersionId,
    'appCodeVersions.lowerRepo': { $ne: lowerRepo }
  }, {
    $push: { appCodeVersions: repoInfo }
  })
  .tap((contextVersion) => {
    // this is our check to make sure the repo isn't added to this context version yet
    if (!contextVersion) {
      throw Boom.conflict('Github Repository already added')
    }
  })
  .then(() => {
    return github.getRepoAsync(repoInfo.repo)
  })
  .then((githubRepoInfo) => {
    return github.createHooksAndKeys(repoInfo.repo)
    .catch((updateErr) => {
      // we failed to talk with github - remove entry
      // remove entry in appCodeVersions
      return ContextVersion.findOneAndUpdateAsync({
        _id: contextVersionId
      }, {
        $pull: {
          appCodeVersions: {
            lowerRepo: lowerRepo
          }
        }
      })
      .then((contextVersion) => {
        if (!contextVersion) {
          throw Boom.badImplementation('could not remove the repo from your project')
        }
      })
    })
    .then((githubKeys) => {
      // update the database with the keys that were added, and gogogo!
      return ContextVersion.findOneAndUpdateAsync({
        _id: contextVersionId,
        'appCodeVersions.lowerRepo': lowerRepo
      }, {
        $set: {
          'appCodeVersions.$.defaultBranch': githubRepoInfo.default_branch,
          'appCodeVersions.$.publicKey': githubKeys.publicKey,
          'appCodeVersions.$.privateKey': githubKeys.privateKey
        }
      })
      .then((contextVersion) => {
        if (!contextVersion) {
          throw Boom.badImplementation('could not save deploy keys')
        }
      })
    })
  })
}

ContextVersionSchema.methods.pullAppCodeVersion = function (appCodeVersionId, cb) {
  var log = logger.child({
    appCodeVersionId: appCodeVersionId,
    method: 'pullAppCodeVersion'
  })
  log.trace('pullAppCodeVersion called')
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
  var log = logger.child({
    appCodeVersions: appCodeVersions,
    method: 'getMainAppCodeVersion'
  })
  log.trace('getMainAppCodeVersion called')
  if (!Array.isArray(appCodeVersions)) { return null }
  if (appCodeVersions.length === 0) { return null }
  return find(appCodeVersions, function (appCodeVersion) {
    return !appCodeVersion.additionalRepo
  })
}
/**
 * returns the main appCodeVersion
 * @return {object} main appCodeVersion
 */
ContextVersionSchema.methods.getMainAppCodeVersion = function () {
  var log = logger.child({
    contextVersion: this,
    method: 'getMainAppCodeVersion'
  })
  log.trace('getMainAppCodeVersion called')
  return ContextVersion.getMainAppCodeVersion(this.appCodeVersions)
}

/**
 * Generate a query to query for appCodeVersions by repo, branch and commit
 * @param {Array} [appCodeVersion] - Array of appCodeVersion
 * @param {Object} appCodeVersion - Object with parameters to query appCodeVersions
 * @param {String} appCodeVersion.repo - Name of repo for which to query appCodeVersions
 * @param {String} appCodeVersion.branch - Name of branch for which to query appCodeVersions
 * @param {String} appCodeVersion.commit - Commit for which to query appCodeVersions
 * @returns {Object} acvs - query object for mongo
 */
ContextVersionSchema.statics.generateQueryForAppCodeVersions = function (appCodeVersions) {
  var log = logger.child({
    appCodeVersions: appCodeVersions,
    method: 'generateQueryForAppCodeVersions'
  })
  log.trace('generateQueryForAppCodeVersions called')
  if (!Array.isArray(appCodeVersions)) {
    throw Boom.badRequest('`appCodeVersions` must be an array')
  }
  appCodeVersions.forEach(function (acv) {
    if (!isObject(acv)) {
      throw Boom.badRequest('All `appCodeVersion`s must be objects')
    }
    if (![acv.repo, acv.branch, acv.commit].every(isString)) {
      throw Boom.badRequest('`appCodeVersion` repo, branch and commit properties are required and must all be strings')
    }
  })
  /* We need to get the versions that match the app code versions we were given in an
   * array (i.e. [{repo, branch, commit}, {repo, branch, commit}]). This function loops
   * quickly over that list and makes a mongo query so that we match ALL the truples we
   * were given, and (with the $size parameter) not a subset.
   */
  var acvsQuery = {
    $size: 0,
    $all: [
      // for reference, this is what we need to have in $all
      // {
      //   $elemMatch: {
      //     repo: '',
      //     branch: '',
      //     commit: ''
      //   }
      // }
    ]
  }
  appCodeVersions.forEach(function (acv) {
    acvsQuery.$size += 1
    var elemMatch = {
      $elemMatch: {
        lowerRepo: acv.repo.toLowerCase(),
        lowerBranch: acv.branch.toLowerCase(),
        commit: acv.commit
      }
    }
    acvsQuery.$all.push(elemMatch)
  })
  return acvsQuery
}

/**
 * Generate a query to query for appCodeVersions by repo and branch
 * @param {String} repo - Name of the repo
 * @param {String} branch - Name of the branch
 * @returns {Object} query - query object for mongo
 */
ContextVersionSchema.statics.generateQueryForBranchAndRepo = function (repo, branch) {
  var log = logger.child({
    repo: repo,
    branch: branch,
    method: 'generateQueryForBranchAndRepo'
  })
  log.trace('generateQueryForBranchAndRepo called')
  if (!isString(repo) || !isString(branch)) {
    throw Boom.badRequest('`repo` and `branch` must both be strings')
  }
  return {
    appCodeVersions: {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase(),
        additionalRepo: { $exists: false }
      }
    }
  }
}

ContextVersionSchema.methods.modifyAppCodeVersionWithLatestCommit = function (user, cb) {
  const log = logger.child({
    contextVersion: this,
    user: user,
    method: 'modifyAppCodeVersionWithLatestCommit'
  })
  log.info('called')
  var self = this
  var updatableAdditionalRepos = this.appCodeVersions.filter(function (acv) {
    return acv.additionalRepo && acv.useLatest
  })
  // if nothing to update - just return current contextVersion
  if (!updatableAdditionalRepos || updatableAdditionalRepos.length === 0) {
    log.trace('finish no updatableAdditionalRepos')
    return cb(null, this)
  }
  // This token might belong to HelloRunnable since this API call might be
  // called by the worker. It might not have access to the branch
  var githubToken = keypather.get(user, 'accounts.github.accessToken')
  async.each(updatableAdditionalRepos, function (acv, eachCb) {
    var github = new Github({ token: githubToken })
    log.trace(
      { repo: acv.repo, branch: acv.branch },
      'modifyAppCodeVersionWithLatestCommit getBranch'
    )
    github.getBranch(acv.repo, acv.branch, function (err, branch) {
      if (err) {
        log.error(
          { repo: acv.repo, branch: acv.branch, err: err },
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
  var log = logger.child({
    appCodeVersionId: appCodeVersionId,
    contextVersion: this,
    data: data,
    method: 'modifyAppCodeVersion'
  })
  log.trace('modifyAppCodeVersion called')
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

ContextVersionSchema.statics.modifyAppCodeVersionByRepo = function (versionId, repo, branch, commit, pullRequest, cb) {
  const log = logger.child({
    branch,
    commit,
    method: 'modifyAppCodeVersionByRepo',
    repo,
    versionId,
    pullRequest
  })
  log.trace('called')
  ContextVersion.findOneAndUpdate({
    _id: versionId,
    'appCodeVersions.lowerRepo': repo.toLowerCase()
  }, {
    $set: {
      'appCodeVersions.$.branch': branch,
      'appCodeVersions.$.lowerBranch': branch.toLowerCase(),
      'appCodeVersions.$.commit': commit,
      'appCodeVersions.$.pullRequest': pullRequest
    }
  }, cb)
}

/**
 * Finds a completed duplicate of the context version.
 * @param {function} cb Callback to execute with the result of the find.
 */
ContextVersionSchema.methods.findCompletedDupe = function (cb) {
  var self = this
  var query = ContextVersion.addAppCodeVersionQuery(self, {
    'build.completed': { $exists: true },
    'build.failed': { $ne: true },
    'build.hash': self.build.hash,
    'build._id': { $ne: self.build._id } // ignore self
  })
  if (exists(self.advanced)) {
    query.advanced = self.advanced
  }
  query.$or = [
    { 'buildDockerfilePath': { $exists: false } },
    { 'buildDockerfilePath': null }
  ]
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
  var log = logger.child({
    contextVersion: this,
    method: 'findPendingDupe'
  })
  log.info('findPendingDupe called')
  var self = this
  var thirtyMinutesAgo = moment().subtract(30, 'minutes').toDate()
  var query = {
    'build.completed': { $exists: false },
    'build.failed': { $ne: true },
    'build.hash': self.build.hash,
    'build._id': { $ne: self.build._id }, // ignore self
    $and: [
      {
        $or: [
          { 'buildDockerfilePath': { $exists: false } },
          { 'buildDockerfilePath': null }
        ]
      },
      {
        // There is a secnario where a build might never start. This is a bug. However we don't want
        // to always dedupe to that build. So this prevents that.
        $or: [
          {
            'build.dockerContainer': { $exists: false },
            'build.started': { $gte: thirtyMinutesAgo }
          },
          {
            'build.dockerContainer': { $exists: true }
          }
        ]
      }
    ]
  }
  if (exists(self.advanced)) {
    query.advanced = self.advanced
  }
  query = ContextVersion.addAppCodeVersionQuery(self, query)
  var opts = {
    sort: 'build.started',
    limit: 1
  }
  log.info({ query: query, opts: opts }, 'contextVersion.methods.findPendingDupe')
  ContextVersion.find(query, null, opts, function (err, duplicates) {
    if (err) {
      log.error({ err: err }, 'findPendingDupe: find error')
      return cb(err)
    }
    var oldestPending = duplicates[0]
    log.trace({
      oldestPending: oldestPending ? oldestPending._id : undefined
    }, 'findPendingDupe: find success')
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
  var log = logger.child({
    contextVersion: this,
    hash: hash,
    method: 'setHash'
  })
  log.info('setHash called')
  var self = this
  var query = {
    $set: {
      'build.hash': hash
    }
  }
  self.update(query, function (err) {
    if (err) {
      log.error({ err: err }, 'contextVersion: setHash error')
      return cb(err)
    }
    log.trace({ hash: hash }, 'contextVersion: setHash success')
    self.build.hash = hash
    cb()
  })
}

ContextVersionSchema.methods.getAndUpdateHash = function (cb) {
  var log = logger.child({
    contextVersion: this,
    method: 'getAndUpdateHash'
  })
  log.info('getAndUpdateHash called')
  var self = this
  var icvId = self.infraCodeVersion
  InfraCodeVersion.findByIdAndGetHash(icvId, function (err, hash) {
    if (err) { return cb(err) }
    self.updateBuildHash(hash, cb)
  })
}

/**
 * looks for build from contextVersions with the same hash and
 * appcode then updates build if dupe
 * @return contextVersion self
 */
ContextVersionSchema.methods.dedupeBuild = function (callback) {
  var log = logger.child({
    contextVersion: this,
    method: 'dedupeBuild'
  })
  log.info('dedupeBuild called')
  var self = this
  if (self.buildDockerfilePath) {
    // DO NOT try to dedup the build if using an external dockerfile, since we don't have any
    // way to know how it compares to any previous one
    return callback(null, self)
  }
  async.waterfall([
    self.getAndUpdateHash.bind(self), // hash should be set here to dedupe multiple started builds
    self.findPendingDupe.bind(self),
    findCompletedDupe, // must be done after pending due to race
    checkOwnerMatch,
    replaceIfDupe
  ], callback)

  // find youngest completed builds, (excluding self) which match hash and app-code
  function findCompletedDupe (pendingDupe, cb) {
    log.trace('dedupeBuild: findCompletedDupe')

    // always use oldest pending duplicate if it exists
    if (pendingDupe) {
      log.trace('dedupeBuild: findCompletedDupe: skipping, using pending duplicate')
      return cb(null, pendingDupe)
    }

    self.findCompletedDupe(function (err, completedDupe) {
      if (err) {
        log.trace({ err: err },
          'dedupeBuild: findCompletedDupe: failed to find dupe')
        return cb(err)
      }
      cb(null, completedDupe)
    })
  }

  // Check to ensure that the owners are the same on the duplicate
  function checkOwnerMatch (dupe, cb) {
    log.trace('dedupeBuild: checkOwnerMatch')
    if (
      (isObject(dupe) && isObject(dupe.owner)) &&
      (self.owner.github !== dupe.owner.github)
    ) {
      log.trace('dedupeBuild: owners do not match, stopping dedupe')
      cb(null, null)
    } else {
      cb(null, dupe)
    }
  }

  function replaceIfDupe (dupe, cb) {
    log.trace('dedupeBuild: replaceIfDupe')
    if (dupe) { // dupe found
      log.trace('dedupeBuild: replaceIfDupe dupe found')
      monitorDog.increment('contextVersion.build.deduped')
      self.copyBuildFromContextVersion(dupe, cb)
    } else {
      log.trace('dedupeBuild: replaceIfDupe no dupe')
      monitorDog.increment('contextVersion.build.noDupe')
      cb(null, self)
    }
  }
}

ContextVersionSchema.methods.copyBuildFromContextVersion = function (dupeCv, cb) {
  var log = logger.child({
    contextVersion: this,
    dupeCv: dupeCv._id,
    method: 'copyBuildFromContextVersion'
  })
  var self = this // cv to dedupe build.
  var $set = getSetForDedupe(this, dupeCv)
  log.info('copyBuildFromContextVersion called')
  self.modifySelf({ $set: $set }, function (err, dedupedCv) {
    // dedupedCv is updated version of self
    if (err) {
      log.error({ err: err },
        'copyBuildFromContextVersion: self.modifySelf error')
      return cb(err)
    }
    if (!dupeCv.build.completed) {
      log.trace({ dedupedCv: dedupedCv._id },
        'copyBuildFromContextVersion: !dupeCv.build.completed')
      // check for race condition (read checkIfDedupedShouldBeUpdated's doc)
      checkIfDedupedShouldBeUpdated(dupeCv, dedupedCv, cb)
    } else {
      log.trace({ dedupedCv: dedupedCv._id },
        'copyBuildFromContextVersion: dupeCv.build.completed emit')
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
  var log = logger.child({
    dedupedCv: dedupedCv._id,
    dupeCv: dupeCv._id,
    method: 'checkIfDedupedShouldBeUpdated'
  })
  log.info('checkIfDedupedShouldBeUpdated called')
  dupeCv.findSelf(function (err, foundDupeCv) {
    if (err) {
      log.trace({ err: err }, 'checkIfDedupedShouldBeUpdated: findSelf')
      return cb(err)
    }
    if (!foundDupeCv) {
      log.trace('checkIfDedupedShouldBeUpdated: not found')
      return cb(null, dedupedCv)
    }
    // After the build container is created, there are only 2 statuses that can change
    // build.completed, and build.containerStarted
    if (!keypather.get(foundDupeCv, 'build.completed') &&
      (keypather.get(dupeCv, 'build.containerStarted') === keypather.get(foundDupeCv, 'build.containerStarted'))) {
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
    log.trace({
      query: query,
      foundDupeCv: foundDupeCv._id
    }, 'checkIfDedupedShouldBeUpdated: dupe has changed')
    ContextVersion.findOneAndUpdate(query, { $set: $set }, function (err, updatedDedupedCv) {
      if (err) {
        log.trace({ err: err }, 'checkIfDedupedShouldBeUpdated: findOneAndUpdate error')
        return cb(err)
      }
      if (!updatedDedupedCv) {
        log.trace({
          foundDupeCv: foundDupeCv._id
        }, 'checkIfDedupedShouldBeUpdated: deduped cv was already complete')
        return cb(null, dedupedCv)
      }
      log.trace({
        updatedDedupedCv: updatedDedupedCv._id
      }, 'checkIfDedupedShouldBeUpdated: deduped cv was not complete and was just marked as completed')
      emitIfCompleted(updatedDedupedCv)
      cb(null, updatedDedupedCv)
    })
  })
}

/**
 * Mark all the context versions as dockRemoved on the particular dockerHost
 * @param {String} dockerHost format: http://10.0.0.1:4242
 * @return {Promise} with number of updated cvs
 */
ContextVersionSchema.statics.markDockRemovedByDockerHost = function (dockerHost) {
  var log = logger.child({
    dockerHost: dockerHost,
    method: 'markDockRemovedByDockerHost'
  })
  log.info('markDockRemovedByDockerHost called')
  return ContextVersion.updateAsync(
    { dockerHost: dockerHost },
    { $set: { dockRemoved: true } },
    { multi: true })
}

/**
 * Set the dockRemoved flag to false if dockRemoved was true.
 * @param {ObjectId} cvId - ContextVersion id to recover
 * @param {function} cb
 */
ContextVersionSchema.statics.recover = function (cvId, cb) {
  var log = logger.child({
    contextVersionId: cvId,
    method: 'recover'
  })
  log.trace('recover called')
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
 * get memory limit to assign to this cv's user container
 * @returns {String} memory in bytes to limit to
 */
ContextVersionSchema.methods.getUserContainerMemoryLimit = function () {
  var log = logger.child({
    contextVersion: this,
    defaultMemoryLimit: process.env.CONTAINER_SOFT_MEMORY_LIMIT_BYTES,
    method: 'getUserContainerMemoryLimit',
    userContainerMemoryInBytes: this.userContainerMemoryInBytes
  })
  log.info('getUserContainerMemoryLimit called')

  if (this.userContainerMemoryInBytes) {
    log.trace('getUserContainerMemoryLimit - Custom container memory overridden.')
    return this.userContainerMemoryInBytes
  }

  log.trace('getUserContainerMemoryLimit - Using default values')
  return process.env.CONTAINER_SOFT_MEMORY_LIMIT_BYTES
}

/**
 * Build this contextVersion, or dedup it to one that is already building
 *
 * @param contextVersion       {Object}  contextVersion to build
 * @param sessionUser          {Object}  the current sessionUser
 * @param opts                 {Object}  build options
 * @param opts.message         {String}  build message
 * @param opts.triggeredAction {Object}  Action that caused the build
 * @param opts.noCache         {Boolean} true if this build should skip deduping
 * @returns                    {Promise} Resolves when a dedup has been found, or the build job was created
 * @resolves                   {Object}  This CV, or the one this dedups to *
 *
 */
ContextVersionSchema.statics.buildSelf = function (contextVersion, sessionUser, opts) {
  var log = logger.child({
    contextVersion: contextVersion,
    opts: opts,
    method: 'buildSelf'
  })
  var originalCvId = contextVersion._id.toString()
  log.info('called')

  return Promise.resolve(keypather.get(contextVersion, 'build'))
    .then(function (thisCvBuild) {
      if (thisCvBuild.started) {
        throw Boom.conflict('cannot build a context version that is already building or built')
      }
      return contextVersion
    })
    .then(function (contextVersion) {
      return contextVersion.modifyAppCodeVersionWithLatestCommitAsync(sessionUser)
    })
    .then(function (contextVersion) {
      if (!opts.noCache) {
        // dedupe: overwrites this contextVersion model, only dedupes with in-progress or completed cv
        return contextVersion.dedupeAsync()
      }
      return contextVersion
    })
    .then(function (contextVersion) {
      if (keypather.get(contextVersion, 'build.started')) {
        // dupe found
        log.trace('METHOD: (Dedup found) contextVersion.build.started')
        if (contextVersion._id.toString() !== originalCvId) {
          return ContextVersion.removeByIdAsync(originalCvId)
            .catch(error.log)
            .return(contextVersion)
        }
        return contextVersion
      } else {
        log.trace('METHOD: NOT contextVersion.build.started')
        return ContextVersion._startBuild(contextVersion, sessionUser, opts)
      }
    })
}

/**
 * Adds the build.started property, and either populates the cv.build info with a dupe, or creates
 * a create-image-builder-container job
 * @param contextVersion       {Object}  contextVersion to build
 * @param sessionUser          {Object}  the current sessionUser
 * @param opts                 {Object}  build options
 * @param opts.message         {String}  build message
 * @param opts.triggeredAction {Object}  Action that caused the build
 * @param opts.noCache         {Boolean} true if this build should skip deduping
 * @returns {Promise} Promise that resolves when the CV has a build job, or has been updated
 * @resolves {Object} ContextVersion with new build info, or a job
 * @private
 */
ContextVersionSchema.statics._startBuild = function (contextVersion, sessionUser, opts) {
  var log = logger.child({
    contextVersion,
    sessionUser,
    opts,
    method: '_startBuild'
  })
  var oldBuildId = keypather.get(contextVersion, 'build._id.toString()')
  log.info('called')
  return contextVersion.setBuildStartedAsync(sessionUser, opts)
    .then(function (contextVersion) {
      if (!opts.noCache) {
        log.trace('METHOD: dedupBuild')
        return contextVersion.dedupeBuildAsync()
      }
      return contextVersion.getAndUpdateHashAsync()
        .return(contextVersion)
    })
    .then(function (contextVersion) {
      if (oldBuildId === contextVersion.build._id.toString()) {
        return contextVersion.populateOwnerAsync(sessionUser)
          .then(function (contextVersion) {
            rabbitMQ.createImageBuilderContainer({
              manualBuild: keypather.get(opts, 'triggeredAction.manual') || false,
              sessionUserGithubId: sessionUser.accounts.github.id,
              ownerUsername: contextVersion.owner.username,
              contextId: contextVersion.context.toString(),
              contextVersionId: contextVersion._id.toString(),
              contextVersionBuildId: contextVersion.build._id.toString(),
              noCache: opts.noCache || false
            })
          })
          .return(contextVersion)
      }
      return contextVersion
    })
}

/**
 * contains all cv states
 * @type {Object}
 */
ContextVersionSchema.statics.states = {
  buildErrored: 'build_errored',
  buildStarted: 'build_started',
  buildStarting: 'build_starting',
  buildSucceeded: 'build_succeeded'
}

ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema)
Promise.promisifyAll(ContextVersion)
Promise.promisifyAll(ContextVersion.prototype)

function getSetForDedupe (deduped, dupe) {
  const dupeCopyFields = ['build', 'dockerHost', 'state']
  dupe = dupe._doc ? dupe._doc : dupe
  const $set = pick(dupe, dupeCopyFields)
  // advanced works differently than dupeCopyFields.
  // advanced should be false if the dupe or the cv is marked false.
  // when advanced is false it results in a better user experience,
  // as we can show more information about the instance's image.
  $set.advanced = !(dupe.advanced === false || deduped.advanced === false)
  return $set
}

/**
 * Error thrown contextVersion not found
 * @param {string} query - query used to fetch this CV
 * @param {Object} level - error level
 */
ContextVersion.NotFoundError = class extends BaseSchema.NotFoundError {
  constructor (query, level) {
    super('ContextVersion', query, level || 'critical')
  }
}

/**
 * Error thrown contextVersion is not building when it should be
 * @param {ContextVersion} contextVersion - model
 */
ContextVersion.UnbuiltError = class extends BaseSchema.IncorrectStateError {
  constructor (contextVersion) {
    super(
      'ContextVersion',
      'the attached contextVersion ' + keypather.get(contextVersion, '_id') + ' to be building',
      'wasn\'t',
      'critical'
    )
  }
}

/**
 * Error thrown contextVersion is not in the expected state
 * @param {string} expectedState  expected status of contextVersion
 * @param {Object} contextVersion contextVersion object
 */
ContextVersion.IncorrectStateError = class extends BaseSchema.IncorrectStateError {
  constructor (expectedState, contextVersion) {
    const state = keypather.get(contextVersion, 'state')
    super(
      'ContextVersion',
      expectedState,
      state,
      'debug'
    )
  }
}
