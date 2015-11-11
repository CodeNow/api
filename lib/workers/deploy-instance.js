/**
 * This worker is invoked with either a buildId (to fetch instances with), or an instanceId'
 *
 * input data
 *  req: either buildId || instanceId
 *  optional: forceDock
 *
 * Steps:
 *
 *  Fetch the instances
 *  Fetch the build
 *  if build is manual
 *    deploy all instances with it attached
 *  else if autodeployed
 *    filter out instances with autodeploy === false
 *  save the Build's contextversion in the instance model
 *  find dock for container, create dock
 *  enqueue createInstanceContainer
 *  emit deploy instance update
 *  emit slack update
 *
 *
 * @module lib/workers/deploy-instance
 */
'use strict'

require('loadenv')()
var Promise = require('bluebird')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')

var BaseWorker = require('workers/base-worker')
var Mavis = require('models/apis/mavis')
var rabbitMQ = require('models/rabbitmq')
var error = require('error')
var logger = require('middlewares/logger')(__filename)

var AcceptableError = BaseWorker.acceptableError
var log = logger.log

module.exports = DeployInstanceWorker

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'DeployInstanceWorker module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'DeployInstanceWorker domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    var worker = new DeployInstanceWorker(data)
    worker.handle(done)
  })
}

function DeployInstanceWorker (data) {
  log.info('DeployInstanceWorker constructor')

  this.instanceId = data.instanceId
  this.buildId = data.buildId
  this.sessionUserGithubId = data.sessionUserGithubId
  this.ownerUsername = data.ownerUsername
  this.forceDock = data.forceDock

  BaseWorker.apply(this, arguments)
}

util.inherits(DeployInstanceWorker, BaseWorker)
/**
 * handles the work
 * @param done
 */
DeployInstanceWorker.prototype.handle = function (done) {
  log.info(this.logData, 'DeployInstanceWorker.prototype.handle')
  var self = this

  var instanceQuery = {}
  if (this.instanceId) {
    // If we are given an instance Id, we only should focus on it, and not deploy any other ones
    instanceQuery._id = this.instanceId
  } else if (this.buildId) {
    // If we are only given a buildId, we'll be fetching all instances with this build attached
    instanceQuery.build = this.buildId
  } else {
    // If we get neither.. log an error and call done
    this.logError(
      this.logData,
      new Error('DeployInstanceWorker started without a buildId or instanceId'),
      'DeployInstanceWorker handle failed to run at all'
    )
    return done()
  }
  if (!this._validateSelfData()) {
    return done()
  }

  return this._pFindInstances(instanceQuery)
    .then(function findBuild (instances) {
      return self._pBaseWorkerFindBuild({
        '_id': self.buildId,
        completed: { $exists: true },
        failed: false
      }).then(function findContextVersion (build) {
        return self._pBaseWorkerFindContextVersion({
          _id: build.contextVersions[0]
        })
      })
        .then(function updateCvAndGetDock (cv) {
          return Promise.props({
            filteredInstances: self._pFilterAndSaveCvToInstances(instances, cv),
            dockHost: self._pGetDockHost(cv).bind(self)
          }).then(function createContainers (data) {
            return self._enqueueCreateContainerWorkers(
              data.filteredInstances,
              cv,
              data.dockHost
            )
          })
        })
    })
    .then(self._pEmitEvents.bind(self))
    .catch(AcceptableError, function (err) {
      // We can ignore these errors
      log.warn(
        self.logData,
        err,
        'DeployInstanceWorker AcceptableError occurred'
      )
    })
    .catch(function (err) {
      self.logError(put({
        err: err
      }, self.logData), err, 'DeployInstanceWorker final error')
    })
    .finally(done)
}

/**
 * Check that the necessary data has been extracted from the job
 * @returns {boolean} true if valid
 */
DeployInstanceWorker.prototype._validateSelfData = function () {
  if (!this.sessionUserGithubId) {
    this.logError(
      this.logData,
      new Error('DeployInstanceWorker started without a sessionUserGithubId'),
      'DeployInstanceWorker handle failed to run at all'
    )
    return false
  } else if (!this.ownerUsername) {
    this.logError(
      this.logData,
      new Error('DeployInstanceWorker started without an ownerUsername'),
      'DeployInstanceWorker handle failed to run at all'
    )
    return false
  }
  return true
}

/**
 * Wraps the BaseWorker._pFindInstances, this checks to makes sure the instances list isn't empty.
 * If it is, an Acceptable Error is thrown, and the worker is finished
 * @param query
 * @private
 * @returns {Promise} list of instances
 */
DeployInstanceWorker.prototype._pFindInstances = function (query) {
  log.info(put({
    query: query
  }, this.logData), 'DeployInstanceWorker.prototype._pFindInstances')
  var self = this
  return self._pBaseWorkerFindInstances(query)
    .catch(function (err) {
      self.logError(self.logData, err, 'DeployInstanceWorker findInstances failed')
      throw err
    })
    .then(function (instances) {
      if (!instances.length) {
        // No instances have this build, so throw an allowable error so the worker finishes
        throw new AcceptableError('No instances were found')
      }
      if (!self.buildId) {
        self.buildId = instances[0].build
      }
      return instances
    })
}

/**
 * Updates the instances with the new data from the update query
 * @param instance instance to update
 * @param updateQuery value to be $set in mongo
 * @returns {Promise} updated instance
 * @private
 */
DeployInstanceWorker.prototype._pUpdateInstance = function (instance, updateQuery) {
  log.info(put({
    'instance._id': instance._id,
    query: updateQuery
  }, this.logData), 'DeployInstanceWorker.prototype._pUpdateInstance')
  var self = this
  // Don't use promisify with Mongoose queries.... just don't.  Everything will fail
  return new Promise(function (resolve, reject) {
    instance.update({
      '$set': updateQuery
    }, {
      multi: false
    }, function (err, result) {
      if (err) {
        self.logError(self.logData, err, 'DeployInstanceWorker _pUpdateInstance failed')
        return reject(err)
      } else {
        return resolve(result)
      }
    })
  })
}

/**
 * Takes a list of instances and filters out ones that should not be auto-deployed, then saves
 * the given contextVersion info to each remaining instance
 * @param instances instances to filter
 * @param cv ContextVersion to save
 * @returns {Promise} array of updates instances
 */
DeployInstanceWorker.prototype._pFilterAndSaveCvToInstances =
  Promise.method(function (instances, cv) {
    log.info(this.logData, 'DeployInstanceWorker.prototype._pFilterAndSaveCvToInstances')
    var self = this
    if (!keypather.get(cv, 'build.triggeredAction.manual')) {
      // Manual means all the instances should update
      instances = instances.filter(function (instance) {
        return (!instance.locked)
      })
    }
    if (!instances.length) {
      throw new AcceptableError('No instances were found to deploy')
    }
    return Promise.all(instances.map(function (instance) {
      return self._pUpdateInstance(instance, {
        'contextVersion': cv.toJSON() // never forget
      })
    }))
  })

/**
 * Gets the dock host data based on the given ContextVersion
 * @param cv ContextVersion to get a dock host for
 * @returns {Promise} dock address
 * @private
 */
DeployInstanceWorker.prototype._pGetDockHost = function (cv) {
  log.info(this.logData, 'DeployInstanceWorker.prototype._pGetDockHost')
  if (this.forceDock) {
    return Promise.resolve(this.forceDock)
  }
  var self = this
  var mavis = new Mavis()
  return Promise.promisify(mavis.findDockForContainer).bind(mavis)(cv)
    .catch(function (err) {
      self.logError(put({
        err: err
      }, self.logData), err, 'DeployInstanceWorker mavis findDockForContainer ERROR')
      throw err
    })
}

/**
 * Enqueue worker to create containers for each instance
 * @param instances list of instances
 * @param contextVersion
 * @param dockerHost hostIp of the dock
 * @returns {*} List of instances
 * @private
 */
DeployInstanceWorker.prototype._enqueueCreateContainerWorkers = function (instances, contextVersion, dockerHost) {
  log.info(this.logData, 'DeployInstanceWorker.prototype._enqueueCreateContainerWorkers')
  var self = this
  instances.forEach(function (instance) {
    var instanceEnvs = instance.env
    if (instance.toJSON) {
      instanceEnvs = instance.toJSON().env
    }
    instanceEnvs.push('RUNNABLE_CONTAINER_ID=' + instance.shortHash)
    var labels = {
      contextVersionId: contextVersion._id.toString(),
      creatorGithubId: keypather.get(instance, 'createdBy.github.toString()'),
      instanceId: keypather.get(instance, '_id.toString()'),
      instanceName: keypather.get(instance, 'name.toString()'),
      instanceShortHash: keypather.get(instance, 'shortHash.toString()'),
      ownerGithubId: keypather.get(instance, 'owner.github.toString()'),
      ownerUsername: self.ownerUsername,
      sessionUserGithubId: self.sessionUserGithubId.toString()
    }
    var createInstanceContainerJobData = {
      cvId: contextVersion._id.toString(),
      dockerHost: dockerHost,
      instanceEnvs: instanceEnvs,
      instanceId: keypather.get(instance, '_id.toString()'),
      labels: labels,
      sessionUserId: self.sessionUserGithubId
    }
    rabbitMQ.createInstanceContainer(createInstanceContainerJobData)
  })
  return instances
}

/**
 * Emits the socket message for each instances in the given array
 * @param instances List of instances
 * @returns {Promise} resolves after all instances have emitted their event
 * @private
 */
DeployInstanceWorker.prototype._pEmitEvents = function (instances) {
  log.info(this.logData, 'DeployInstanceWorker.prototype._pEmitEvents')
  var self = this
  return Promise.all(instances.map(function (instance) {
    return self._pBaseWorkerUpdateInstanceFrontend(
      instance._id.toString(),
      self.sessionUserGithubId,
      'deploy'
    )
  }))
}
