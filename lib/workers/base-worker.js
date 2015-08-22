/**
 * @module lib/workers/base
 */
'use strict';

var keypather = require('keypather')();
var put = require('101/put');

var Instance = require('models/mongo/instance');
var log = require('middlewares/logger')(__filename).log;
var messenger = require('socket/messenger');

module.exports = BaseWorker;

function BaseWorker () {}

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
