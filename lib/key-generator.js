/**
 * @module lib/key-generator
 */
'use strict';

require('loadenv')();

var async = require('async');

var Keypair = require('models/mongo/keypair');
var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);
var noop = require('101/noop');

var log = logger.log;

module.exports.start = function (cb) {
  cb = cb || noop;
  var self = this;
  checkAndGenerateKeypairs(function (err) {
    if (err) {
      log.error({err: err}, 'something went wrong in the key generator');
      cb(err);
    } else {
      self.interval = setInterval(checkAndGenerateKeypairs, 60*1000);
      cb();
    }
  });
  return this;
};

module.exports.stop = function (cb) {
  cb = cb || noop;
  if (this.interval) {
    clearInterval(this.interval);
  }
  cb();
};

function checkAndGenerateKeypairs (cb) {
  cb = cb || noop;
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
