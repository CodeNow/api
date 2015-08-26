/**
 * @module lib/workers/base
 */
'use strict';

var exists = require('101/exists');
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var uuid = require('node-uuid');

var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');

module.exports = BaseWorker;

function BaseWorker (data) {
  log.info('BaseWorker');
  this.data = data;
  this.logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4()
  }, data);
}

/**
 * finds the contextVersion
 * @param query
 * @param findCvCb
 * @private
 */
BaseWorker.prototype._findContextVersion = function (query, findCvCb) {
  log.info(this.logData, 'CreateImageBuilderContainerWorker.prototype._findContextVersion');
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
    else if (!result) {
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
/**
 * Notify frontend of instance changes
 * @param {String} eventName
 */
BaseWorker.prototype._updateInstanceFrontend = function (eventName) {
  log.info(put({
    eventName: eventName
  }, this.logData), 'BaseWorker.prototype._updateInstanceFrontend');
  if (!keypather.get(this, 'data.instanceId')) {
    log.error(this.logData,
              '_updateInstanceFrontend: !data.instanceId');
    return;
  }
  var self = this;
  Instance.findById(this.data.instanceId, function (err, instance) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_updateInstanceFrontend fetchInstance error');
      return;
    }
    else if (!instance) {
      log.error(self.logData, '_updateInstanceFrontend fetchInstance instance not found');
      return;
    }
    instance.populateModels(function (err) {
      if (err) {
        log.error(put({
          err: err
        }, self.logData), '_updateInstanceFrontend instance.populateModels error');
      }
      else {
        instance.populateOwnerAndCreatedBy(self.user, function (err, instance) {
          if (err) {
            log.error(put({
              err: err
            }, self.logData), '_updateInstanceFrontend instance.populateOwnerAndCreatedBy error');
            return;
          }
          log.trace(self.logData,
                    '_updateInstanceFrontend instance.populateOwnerAndCreatedBy success');
          messenger.emitInstanceUpdate(instance, eventName);
        });
      }
    });
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
