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
 *
 *
 *
 *
 * @module lib/workers/deploy-instance
 */
'use strict';

require('loadenv')();
var Promise = require('bluebird');
var domain = require('domain');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var Mavis = require('models/apis/mavis');
var rabbitMQ = require('models/rabbitmq');
var error = require('error');
var logger = require('middlewares/logger')(__filename);


var AcceptableError = BaseWorker.acceptableError;
var log = logger.log;

module.exports = DeployInstanceWorker;

module.exports.worker = function (data, done) {
  log.trace({
    tx: true,
    dataId: data.id
  }, 'DeployInstanceWorker module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      dataId: data.id,
      err: err
    }, 'DeployInstanceWorker domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    var worker = new DeployInstanceWorker(data);
    worker.handle(done);
  });
};


function DeployInstanceWorker (data) {
  log.trace('DeployInstanceWorker constructor');

  this.instanceId = data.instanceId;
  this.buildId = data.buildId;
  this.sessionUserGithubId = data.sessionUserGithubId;
  this.ownerUsername = data.ownerUsername;
  this.forceDock = data.forceDock;
  this.manualBuild = data.manualBuild;

  BaseWorker.apply(this, data, [{
    instanceId: this.instanceId,
    buildId: this.buildId,
    tid: data.tid
  }]);
}

util.inherits(DeployInstanceWorker, BaseWorker);
/**
 * handles the work
 * @param done
 */
DeployInstanceWorker.prototype.handle = function (done) {
  log.trace(this.logData, 'DeployInstanceWorker.prototype.handle');
  var self = this;

  var instanceQuery = {};
  if (this.instanceId) {
    // If we are given an instance Id, we only should focus on it, and not deploy any other ones
    instanceQuery._id = this.instanceId;
  } else if (this.buildId) {
    // If we are only given a buildId, we'll be fetching all instances with this build attached
    instanceQuery.build = this.buildId;
  } else {
    // If we get neither.. log an error and call done
    self.logError(
      this.logData,
      new Error('DeployInstanceWorker started without a buildId or instanceId'),
      'DeployInstanceWorker handle failed to run at all'
    );
    return done();
  }
  if (!self.validateSelfData()) {
    return done();
  }

  return this._findInstances(instanceQuery)
    .then(function (instances) {
      console.log('\nDW\n1\n\n');
      return self.pFindBuild({
        '_id': self.buildId,
        failed: false
      })
        .then(function (build) {
          console.log('\nDW\n2\n\n');
          return self.pFindContextVersion({
            _id: build.contextVersions[0]
          });
        })
        .then(function (cv) {
          console.log('\nDW\n3\n\n');
          return self._filterAndSaveCvToInstances(instances, cv)
            .then(function (filteredInstances) {
              console.log('\nDW\n4\n\n');
              return self._getDockHost(cv).bind(self)
                .then(function (dockerHost) {
                  console.log('\nDW\n5\n\n');
                  return self._enqueueCreateContainerWorkers(filteredInstances, cv, dockerHost);
                });
            });
        });
    })
    .then(self._emitEvents.bind(self))
    .catch(AcceptableError, function (err) {
      // We can ignore these errors
      log.info(
        self.logData,
        err,
        'DeployInstanceWorker AcceptableError occurred'
      );
    })
    .catch(function (err) {
      self.logError(put({
        err: err
      }, self.logData), err, 'DeployInstanceWorker final error');
    })
    .finally(done);
};
DeployInstanceWorker.prototype.validateSelfData = function () {
  if (!this.sessionUserGithubId) {
    this.logError(
      this.logData,
      new Error('DeployInstanceWorker started without a sessionUserGithubId'),
      'DeployInstanceWorker handle failed to run at all'
    );
    return false;
  } else if (!this.ownerUsername) {
    this.logError(
      this.logData,
      new Error('DeployInstanceWorker started without an ownerUsername'),
      'DeployInstanceWorker handle failed to run at all'
    );
    return false;
  }
  return true;
};

DeployInstanceWorker.prototype._findInstances = function (query) {
  log.trace(put({
    query: query
  }, this.logData), 'DeployInstanceWorker.prototype._findInstances');
  var self = this;
  return self.pFindInstances(query)
    .catch(function (err) {
      self.logError(self.logData, err, 'DeployInstanceWorker findInstances failed');
      throw err;
    })
    .then(function (instances) {
      if (!instances.length) {
        // No instances have this build, so throw an allowable error so the worker finishes
        throw new AcceptableError('No instances were found');
      }
      if (!self.buildId) {
        self.buildId = instances[0].build;
      }
      return instances;
    });
};


DeployInstanceWorker.prototype._updateInstance = function (instance, updateQuery) {
  log.trace(put({
    'instance._id': instance._id,
    query: updateQuery
  }, this.logData), 'DeployInstanceWorker.prototype._updateInstance');
  var self = this;
  return new Promise(function (resolve, reject) {
    instance.update({
      '$set': updateQuery
    }, {
      multi: false
    }, function (err, result) {
      if (err) {
        self.logError(self.logData, err, 'DeployInstanceWorker _updateInstance failed');
        return reject(err);
      } else {
        return resolve(result);
      }
    });
  });
};

DeployInstanceWorker.prototype._filterAndSaveCvToInstances =
    Promise.method(function (instances, cv) {
  log.trace(this.logData, 'DeployInstanceWorker.prototype._filterAndSaveCvToInstances');
  var self = this;
  console.log('triggeredAction', keypather.get(cv, 'build.triggeredAction.manual'));
  if (!keypather.get(cv, 'build.triggeredAction.manual')) {
    // Manual means all the instances should update
    instances = instances.filter(function (instance) {
      console.log('FILTERED', instance);
      return (!instance.locked);
    });
  }
  if (!instances.length) {
    throw new AcceptableError('No instances were found to deploy');
  }
  return Promise.all(instances.map(function (instance) {
    return self._updateInstance(instance, {
      'contextVersion': cv.toJSON()   // never forget

    });
  }));
});

DeployInstanceWorker.prototype._getDockHost = function (cv) {
  log.trace(this.logData, 'DeployInstanceWorker.prototype._getDockHost');
  if (this.forceDock) {
    return Promise.resolve(this.forceDock);
  }
  var self = this;
  var mavis = new Mavis();
  return Promise.promisify(mavis.findDockForContainer).bind(mavis)(cv)
    .catch(function (err) {
      console.log('\n\nAAAAAAAA\n\n\n', err);
      self.logError(put({
        err: err
      }, self.logData), err, 'DeployInstanceWorker mavis findDockForContainer ERROR');
      throw err;
    });
};

DeployInstanceWorker.prototype._enqueueCreateContainerWorkers =
    function (instances, contextVersion, dockerHost) {
  log.trace(this.logData, 'DeployInstanceWorker.prototype._enqueueCreateContainerWorkers');
  var self = this;
  instances.forEach(function (instance) {
    var instanceEnvs = instance.env;
    if (instance.toJSON) {
      instanceEnvs = instance.toJSON().env;
    }
    instanceEnvs.push('RUNNABLE_CONTAINER_ID=' + instance.shortHash);
    var labels = {
      contextVersionId : contextVersion._id.toString(),
      instanceId       : keypather.get(instance, '_id.toString()'),
      instanceName     : keypather.get(instance, 'name.toString()'),
      instanceShortHash: keypather.get(instance, 'shortHash.toString()'),
      creatorGithubId  : keypather.get(instance, 'createdBy.github.toString()'),
      ownerUsername : self.ownerUsername,
      ownerGithubId    : keypather.get(instance, 'owner.github.toString()'),
      sessionUserGithubId : self.sessionUserGithubId.toString()
    };
    var createContainerJobData = {
      cvId: contextVersion._id.toString(),
      sessionUserId: self.sessionUserGithubId,
      buildId: keypather.get(contextVersion, 'build._id.toString()'),
      dockerHost: dockerHost,
      instanceEnvs: instanceEnvs,
      labels: labels
    };
    rabbitMQ.createInstanceContainer(createContainerJobData);
  });
  return instances;
};


DeployInstanceWorker.prototype._emitEvents = function (instances) {
  console.log('\nDW\n_emitEvents\n\n');
  log.trace(this.logData, 'DeployInstanceWorker.prototype._emitEvents');
  var self = this;
  return self.pFindUser(self.sessionUserGithubId).bind(self)
    .then(function () {
      return Promise.all(instances.map(function (instance) {
        return self.pUpdateInstanceFrontend({ '_id': instance._id }, 'deploy').bind(self);
      }));
    });
};
