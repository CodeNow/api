/**
 * @module lib/workers/base-worker
 */
'use strict'

var async = require('async')
var exists = require('101/exists')
var keypather = require('keypather')()
var find = require('101/find')
var pick = require('101/pick')
var put = require('101/put')
var util = require('util')
var uuid = require('node-uuid')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var log = require('middlewares/logger')(__filename).log
var messenger = require('socket/messenger')
var Promise = require('bluebird')

module.exports = BaseWorker
module.exports.acceptableError = AcceptableError

function AcceptableError (message) {
  this.message = message
}
util.inherits(AcceptableError, Error)

/**
 * Base class for workers. Workers inherit shared logic.
 * @class
 */
function BaseWorker (data) {
  log.info('BaseWorker constructor')
  this.data = data
  this.logData = {
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: keypather.get(process, 'domain.runnableData.tid'),
    data: data
  }
}

/**
 * Return standardized log data to worker domains
 * @static
 * @return Object
 */
BaseWorker.getRunnableData = function () {
  return {
    tid: uuid.v4()
  }
}

/**
 * Logs the error to loggly, as well as pushes the error to rollbar
 * @param logData data object we should use in the log
 * @param err actual error object
 * @param extraMessage any extra message that should be displayed
 */
BaseWorker.prototype.logError = function (logData, err, extraMessage) {
  error.log(logData, err)
  log.error(logData, extraMessage)
}

/**
 * fetch all instances based on the given query.
 * @param query Mongoose query to find instances from
 * @return Returns a promise that returns the instances
 *
 */
BaseWorker.prototype._pBaseWorkerFindInstances = function (query) {
  log.info(this.logData, 'BaseWorker.prototype._pBaseWorkerFindInstances')
  var self = this
  return new Promise(function (resolve, reject) {
    Instance.find(query, function (err, instances) {
      if (err) {
        return reject(err)
      } else {
        return resolve(instances)
      }
    })
  }).then(function (instances) {
    log.trace(put({
      instances: instances.length
    }, self.logData), 'BaseWorker: _pBaseWorkerFindInstances success')
    self.instances = instances
    return instances
  })
    .catch(function (err) {
      log.error(put({
        err: err
      }, self.logData), 'BaseWorker: _pBaseWorkerFindInstances error')
      throw err
    })
}

/**
 * finds the build
 * @param query
 * @private returns a promise that returns the build
 */
BaseWorker.prototype._pBaseWorkerFindBuild = function (query) {
  log.info(this.logData, 'BaseWorker.prototype._pBaseWorkerFindBuild')
  var self = this
  return new Promise(function (resolve, reject) {
    Build.findOne(query, function (err, build) {
      if (err) {
        return reject(err)
      } else {
        return resolve(build)
      }
    })
  }).then(function (build) {
    if (!build) {
      throw new Error('Build not found')
    }
    log.trace(self.logData, 'BaseWorker.prototype._pBaseWorkerFindBuild success')
    self.build = build
    return build
  })
    .catch(function (err) {
      log.error(put({
        err: err
      }, self.logData), 'BaseWorker: Build._pBaseWorkerFindBuild error')
      throw err
    })
}

/**
 * find contextVersion
 * @param {Object} query
 * @param {Function} findCvCb
 * @private
 */
BaseWorker.prototype._baseWorkerFindContextVersion = function (query, findCvCb) {
  var logData = put({
    query: query
  }, this.logData)
  log.info(logData, 'BaseWorker.prototype._baseWorkerFindContextVersion')
  var self = this
  ContextVersion.findOne(query, function (err, result) {
    if (err) {
      log.error(put({
        err: err
      }, logData),
        '_baseWorkerFindContextVersion: findOne error'
      )
      return findCvCb(err)
    }
    if (!result) {
      log.warn(
        logData,
        '_baseWorkerFindContextVersion: not found'
      )
      return findCvCb(new Error('contextVersion not found'))
    }
    log.trace(put({
      contextVersion: pick(result, ['_id', 'name', 'owner'])
    }, logData),
      '_baseWorkerFindContextVersion: findOne success'
    )
    self.contextVersion = result
    findCvCb(null, result)
  })
}

/**
 * Promisified version of findContextVersion
 */
BaseWorker.prototype._pBaseWorkerFindContextVersion =
  Promise.promisify(BaseWorker.prototype._baseWorkerFindContextVersion)

/**
 * Emit eventName via primus of instance updates
 * @param {String} query - query or instanceId of mongoose Instance model
 * @param {String} userGithubId - instance of mongoose user model
 * @param {String} eventName
 * @param {Function} cb
 */
BaseWorker.prototype._baseWorkerUpdateInstanceFrontend = function (query, userGithubId, eventName, cb) {
  log.info(put({
    query: query,
    userGithubId: userGithubId,
    eventName: eventName
  }, this.logData), 'BaseWorker.prototype._baseWorkerUpdateInstanceFrontend')
  if (typeof query === 'string') {
    query = { _id: query }
  }
  var self = this
  this._baseWorkerFindUser(userGithubId, function (err, user) {
    if (err) {
      return cb(err)
    }
    self._baseWorkerFindInstance(query, function (err, instance) {
      if (err) {
        return cb(err)
      }
      instance.populateModels(function (err) {
        if (err) {
          log.error(put({
            err: err
          }, self.logData), '_baseWorkerUpdateInstanceFrontend instance.populateModels error')
          return cb(err)
        }
        instance.populateOwnerAndCreatedBy(user, function (err, instance) {
          if (err) {
            log.error(put({
              err: err
            }, self.logData), '_baseWorkerUpdateInstanceFrontend ' +
              'instance.populateOwnerAndCreatedBy error')
            return cb(err)
          }
          log.trace(self.logData,
            '_baseWorkerUpdateInstanceFrontend instance.populateOwnerAndCreatedBy success')
          messenger.emitInstanceUpdate(instance, eventName)
          return cb()
        })
      })
    })
  })
}
/**
 * Promisified version of updateInstanceFrontend
 */
BaseWorker.prototype._pBaseWorkerUpdateInstanceFrontend =
  Promise.promisify(BaseWorker.prototype._baseWorkerUpdateInstanceFrontend)

/**
 * Emit primus event to frontend notifying of success or failure of a build of a contextVersion
 * @param {String} eventName
 */
BaseWorker.prototype._baseWorkerUpdateContextVersionFrontend = function (eventName, cb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerUpdateContextVersionFrontend')
  var cvStatusEvents = ['build_started', 'build_running', 'build_complete']
  var self = this
  if (cvStatusEvents.indexOf(eventName) === -1) {
    return cb(new Error('Attempted status update contained invalid event'))
  }
  this._baseWorkerFindContextVersion({
    '_id': self.contextVersionId
  }, function (err, contextVersion) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_baseWorkerUpdateContextVersionFrontend: emitting update failed')
    } else if (contextVersion) {
      log.trace(self.logData, '_baseWorkerUpdateContextVersionFrontend: emitting update success')
      messenger.emitContextVersionUpdate(contextVersion, eventName)
    }
    cb(err)
  })
}

/**
 * Assert that docker-listener provided job data contains necessary keys
 * @param {Function} cb
 */
BaseWorker.prototype._baseWorkerValidateData = function (requiredKeypaths, cb) {
  var missingKeypath = find(requiredKeypaths, keypathNotExists.bind(null, this.data))
  if (missingKeypath) {
    var err = new Error(
      '_baseWorkerValidateData: event data missing keypath: ' + missingKeypath
    )
    log.error(put({
      err: err,
      key: missingKeypath
    }, this.logData), '_baseWorkerValidateDieData: missing required keypath')
    return cb(err)
  }
  cb()
  function keypathNotExists (data, keypath) {
    return !exists(keypather.get(data, keypath))
  }
}

/**
 * Assert that docker-listener provided die job data contains necessary keys
 * @param {Function} cb
 */
BaseWorker.prototype._baseWorkerValidateDieData = function (cb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerValidateDieData')
  var requiredKeypaths = [
    'from',
    'host',
    'id',
    'time',
    'uuid'
  ]
  this._baseWorkerValidateData(requiredKeypaths, cb)
}

/**
 * find instance and verify specified container is still attached.
 *   - if container is no longer attached (instance not found), worker is done
 * @param {Function} findInstanceCb
 */
BaseWorker.prototype._baseWorkerFindInstance = function (query, findInstanceCb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerFindInstance')
  var self = this
  Instance.findOne(query, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_baseWorkerFindInstance: findOne error')
      return findInstanceCb(err)
    } else if (!result) {
      log.warn(self.logData, '_baseWorkerFindInstance: not found')
      return findInstanceCb(new Error('instance not found'))
    }
    log.trace(put({
      instance: result.toJSON(),//pick(result, ['_id', 'name', 'owner']),
      container: pick(result.container, ['dockerContainer', 'dockerHost']),
      build: pick(result.build, ['_id', 'contextVersions', 'owner', 'failed', 'successful', 'completed'])
    }, self.logData), '_baseWorkerFindInstance: findOne success')
    self.instance = result
    findInstanceCb(null, result)
  })
}

BaseWorker.prototype.pFindInstance =
  Promise.promisify(BaseWorker.prototype._baseWorkerFindInstance)

/**
 * find user, used to join primus org room
 * @param userGithubId
 * @param {Function} findUserCb
 */
BaseWorker.prototype._baseWorkerFindUser = function (userGithubId, findUserCb) {
  var logData = put({
    userGithubId: userGithubId
  }, this.logData)
  log.info(logData, 'BaseWorker.prototype._baseWorkerFindUser')
  var self = this
  User.findByGithubId(userGithubId, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, logData), '_baseWorkerFindUser: findByGithubId error')
      return findUserCb(err)
    } else if (!result) {
      log.warn(logData, '_baseWorkerFindUser: findByGithubId not found')
      return findUserCb(new Error('user not found'))
    }
    log.trace(put({
      user: result.toJSON()
    }, logData), '_baseWorkerFindUser: findByGithubId success')
    self.user = result
    findUserCb.apply(this, arguments)
  })
}

/**
 * TODO once we have proper inspect job
 *
 * Attempt to inspect container X times.
 *   - If operation fails X times, update database w/ inspect error
 *   - If success, update database w/ container inspect
 * @param {Function} inspectContainerAndUpdateCb
 */
BaseWorker.prototype._baseWorkerInspectContainerAndUpdate = function (inspectContainerAndUpdateCb) {
  log.info(this.logData, 'BaseWorker.prototype._baseWorkerInspectContainerAndUpdate')
  var self = this
  var attemptCount = 0
  async.retry({
    times: process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS
  }, function (cb) {
    self.docker.inspectContainer(self.data.dockerContainer, function (err, result) {
      attemptCount++
      if (err) {
        log.warn(put({
          err: err,
          attemptCount: attemptCount
        }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer error')
        return cb(err)
      }
      log.trace(put({
        inspect: result
      }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer success')
      cb(null, result)
    })
  }, function (err, result) {
    if (err) {
      log.warn(put({
        err: err,
        attemptCount: attemptCount
      }, self.logData),
        '_baseWorkerInspectContainerAndUpdate: inspectContainer async.retry final error')
      self.instance.modifyContainerInspectErr(self.data.dockerContainer, err, function (err2) {
        if (err2) {
          log.warn(put({
            err: err2
          }, self.logData), '_baseWorkerInspectContainerAndUpdate: inspectContainer ' +
            'async.retry final error updateInspectError error')
        }
        return inspectContainerAndUpdateCb(err)
      })
    } else {
      log.trace(put({
        attemptCount: attemptCount
      }, self.logData),
        '_baseWorkerInspectContainerAndUpdate: inspectContainer async.retry final success')
      self.instance.modifyContainerInspect(self.data.dockerContainer,
        result,
        function (err2, _instance) {
          if (err2) {
            log.warn(put({
              err: err2
            }, self.logData), '_baseWorkerInspectContainerAndUpdate: modifyContainerInspect ' +
              'async.retry final error updateInspectError error')
            return inspectContainerAndUpdateCb(err2)
          }
          log.trace(self.logData, '_baseWorkerInspectContainerAndUpdate: modifyContainerInspect ' +
            'async.retry final success')
          // updated instance w/ ports on container inspect for remaining network attach operations
          self.instance.container = _instance.container
          return inspectContainerAndUpdateCb()
        })
    }
  })
}
