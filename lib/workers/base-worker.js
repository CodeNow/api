/**
 * @module lib/workers/base
 */
'use strict';

var exists = require('101/exists');
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var uuid = require('node-uuid');

var Build = require('models/mongo/build');
var ContextVersion = require('models/mongo/context-version');
var error = require('error');
var Instance = require('models/mongo/instance');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');
var Promise = require('bluebird');
var User = require('models/mongo/user');

module.exports = BaseWorker;
module.exports.acceptableError = AcceptableError;


function AcceptableError (message) {
  this.message = message;
}
AcceptableError.prototype = new Error();

function BaseWorker (data, logData) {
  if (!logData) {
    logData = data || {};
  }
  log.info('BaseWorker');
  data = data || {};
  this.data = data;
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, logData);
}

BaseWorker.prototype.logError = function (logOutput, err, extraMessage) {
  error.log(logOutput, err);
  log.error(logOutput, extraMessage);
};

/**
 * find instance and verify specified container is still attached.
 *   - if container is no longer attached (instance not found), worker is done
 * @param query
 * @param {Function} findInstanceCb
 */
BaseWorker.prototype._findInstance = function (query, findInstanceCb) {
  log.info(this.logData, 'BaseWorker.prototype._findInstance');
  var self = this;
  Instance.findOne(query, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_findInstance findOne error');
      return findInstanceCb(err);
    }
    if (!result) {
      log.warn(self.logData, '_findInstance not found');
      return findInstanceCb(new Error('instance not found'));
    }
    log.trace(put({
      instance: pick(result, ['_id', 'name', 'owner'])
    }, self.logData), '_findInstance findOne success');
    self.instance = result;
    findInstanceCb(err, result);
  });
};

/**
 * find instance and verify specified container is still attached.
 *   - if container is no longer attached (instance not found), worker is done
 * @param query
 * @param {Function} findInstancesCb
 */
BaseWorker.prototype.pFindInstances = function (query) {
  log.info(this.logData, 'BaseWorker.prototype._findInstance');
  var self = this;

  return new Promise(function (resolve, reject) {
    Instance.find(query, function (err, result) {
      if (err) {
        return reject(err);
      } else {
        self.instances = result;
        return resolve(result);
      }
    });
  });
};


/**
 * find user, used to join primus org room
 * @param sessionUserGithubId
 * @param {Function} findUserCb
 */
BaseWorker.prototype._findUser = function (sessionUserGithubId, findUserCb) {
  log.info(this.logData, 'BaseWorker.prototype._findUser');
  var self = this;
  User.findByGithubId(sessionUserGithubId, function (err, result) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData), '_findUser findByGithubId error');
      return findUserCb(err);
    }
    if (!result) {
      log.warn(self.logData, '_findUser findByGithubId not found');
      return findUserCb(new Error('user not found'));
    }
    log.trace(put({
      user: result.toJSON()
    }, self.logData), '_findUser findByGithubId success');
    self.user = result;
    return findUserCb(err, result);
  });
};
BaseWorker.prototype.pFindUser = Promise.promisify(BaseWorker.prototype._findUser);

/**
 * finds the build
 * @param query
 * @param findCvCb
 * @private returns a promise
 */
BaseWorker.prototype.pFindBuild = function (query) {
  log.info(this.logData, 'BaseWorker.prototype.pFindBuild');
  var self = this;
  return new Promise(function (resolve, reject) {
    Build.findOne(query, function (err, build) {
      if (err || !build) {
        log.error(put({
          err: err
        }, self.logData), 'BaseWorker: Build.pFindBuild error');
        reject(err || new Error('Build not found'));
      } else {
        log.info(self.logData, 'BaseWorker.prototype.pFindBuild success');
        self.build = build;
        resolve(build);
      }
    });
  });
};


/**
 * finds the contextVersion
 * @param query
 * @param findCvCb
 * @private
 */
BaseWorker.prototype._findContextVersion = function (query, findCvCb) {
  log.info(this.logData, 'BaseWorker.prototype._findContextVersion');
  var self = this;
  ContextVersion.findOne(query, function (err, result) {
    if (err) {
      log.error(put({
          err: err
        }, self.logData),
        'BaseWorker _findContextVersion findOne error'
      );
      return findCvCb(err);
    }
    if (!result) {
      log.error(
        self.logData,
        'BaseWorker _findContextVersion not found'
      );
      return findCvCb(new Error('contextVersion not found'));
    }
    log.trace(put({
        contextVersion: pick(result, ['_id', 'name', 'owner'])
      }, self.logData),
      'BaseWorker _findContextVersion findOne success'
    );
    self.contextVersion = result;
    findCvCb(null, result);
  });
};

BaseWorker.prototype.pFindContextVersion =
  Promise.promisify(BaseWorker.prototype._findContextVersion);

/**
 * Notify frontend of instance changes
 * @param {String} eventName
 */
BaseWorker.prototype._updateInstanceFrontend = function (query, eventName, cb) {
  log.info(put({
    query: query,
    eventName: eventName
  }, this.logData), 'BaseWorker.prototype._updateInstanceFrontend');
  var self = this;

  if (!isFunction(cb)) {
    cb = eventName;
    if (!self.instanceId) {
      log.error(this.logData,
        '_updateInstanceFrontend: !instanceId');
      return cb(new Error('Missing instanceId'));
    }
    eventName = query;
    query = { _id: this.instanceId };
  }
  if (!self.user) {
    log.error(this.logData,
      '_updateInstanceFrontend: !user');
    return cb(new Error('Missing User'));
  }

  Instance.findOne(query, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_updateInstanceFrontend fetchInstance error');
      return cb(err);
    }
    else if (!instance) {
      log.error(self.logData, '_updateInstanceFrontend fetchInstance instance not found');
      return cb(new Error('instance not found'));
    }
    instance.populateModels(function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstanceFrontend instance.populateModels error');
        return cb(err);
      }
      instance.populateOwnerAndCreatedBy(self.user, function (err, instance) {
        if (err) {
          log.error(put({
            err: err
          }, self.logData), '_updateInstanceFrontend instance.populateOwnerAndCreatedBy error');
          return cb(err);
        }
        log.trace(self.logData,
                  '_updateInstanceFrontend instance.populateOwnerAndCreatedBy success');
        messenger.emitInstanceUpdate(instance, eventName);
        cb();
      });
    });
  });
};

BaseWorker.prototype.pUpdateInstanceFrontend =
  Promise.promisify(BaseWorker.prototype._updateInstanceFrontend);

var cvStatusEvents = ['build_started', 'build_running', 'build_complete'];
/**
 * Emit primus event to frontend notifying of success or failure of a build of a contextVersion
 */
BaseWorker.prototype._updateFrontendWithContextVersion = function (event, cb) {
  var self = this;
  if (cvStatusEvents.indexOf(event) === -1) {
    return cb(new Error('Attempted status update contained invalid event'));
  }
  log.info(this.logData, 'BaseWorker.prototype._updateFrontendWithContextVersion');

  this._findContextVersion({
    '_id': self.contextVersionId
  }, function (err, contextVersion) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), 'BaseWorker emitting update failed');
    } else if (contextVersion) {
      log.info(self.logData, 'BaseWorker emitting update success');
      messenger.emitContextVersionUpdate(contextVersion, event);
    }
    cb(err);
  });
};


/**
 * Assert that docker-listener provided job data contains necessary keys
 * @param {Function} validateDieDataCb
 */
BaseWorker.prototype._validateDieData = function (validateDieDataCb) {
  log.info(this.logData, 'BaseWorker.prototype._validateDieData');
  var requiredKeys = [
    'from',
    'host',
    'id',
    'time',
    'uuid'
  ];
  var self = this;
  var key;
  for(var i = 0, len = requiredKeys.length; i < len; i++) {
    key = requiredKeys[i];
    if (!exists(self.data[key])) {
      var error = new Error('_validateDieData: die event data missing key: '+key);
      log.error(put({
        err: error,
        key: key
      }, self.logData), '_validateDieData: missing required key');
      return validateDieDataCb(error);
    }
  }
  validateDieDataCb();
};
