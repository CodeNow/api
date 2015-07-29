/**
 * @module lib/key-generator
 */
'use strict';

require('loadenv')();

var async = require('async');

var Keypair = require('models/mongo/keypair');
var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports.start = function () {
  var self = this;
  checkAndGenerateKeypairs(function (err) {
    if (err) {
      log.error({err: err}, 'something went wrong in the key generator');
    } else {
      self.interval = setInterval(checkAndGenerateKeypairs, 60*1000);
    }
  });
  return this;
};

module.exports.stop = function () {
  if (this.interval) {
    clearInterval(this.interval);
  }
};

function checkAndGenerateKeypairs (cb) {
  if (!cb) { cb = require('101/noop'); }
  Keypair.getRemainingKeypairCount(function (err, count) {
    if (err) {
      log.error({err: err}, 'error getting the keypair count');
      cb(err);
    } else {
      dogstatsd.gauge('api.keypairs.count', count);
      var keysToCreate = process.env.GITHUB_DEPLOY_KEYS_POOL_SIZE - count;
      async.whilst(
        function () { return keysToCreate > 0; },
        function (cb) {
          Keypair.createKeypair(function (err) {
            if (err) { cb(err); }
            else {
              Keypair.getRemainingKeypairCount(function (err, count) {
                if (err) { cb(err); }
                else {
                  dogstatsd.gauge('api.keypairs.count', count);
                  keysToCreate = process.env.GITHUB_DEPLOY_KEYS_POOL_SIZE - count;
                  cb(null);
                }
              });
            }
          });
        },
        function (err) {
          if (err) {
            log.error({err: err}, 'error checkAndGenerateKeypairs');
          }
          cb(err);
        }
      );
    }
  });
}
