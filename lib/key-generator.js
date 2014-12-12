'use strict';

var debug = require('debug')('runnable-api:deployKeyGenerator');
require('loadenv')();
var Keypair = require('models/mongo/keypair');
var async = require('async');
var dogstatsd = require('models/datadog');

module.exports.start = function () {
  debug('keypair generator has started');
  var self = this;
  checkAndGenerateKeypairs(function (err) {
    if (err) {
      console.error('something went wrong in the key generator', err);
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
  debug('starting to generate keys');
  Keypair.getRemainingKeypairCount(function (err, count) {
    if (err) {
      debug('error getting the keypair count');
      cb(err);
    } else {
      dogstatsd.gauge('api.keypairs.count', count);
      var keysToCreate = process.env.GITHUB_DEPLOY_KEYS_POOL_SIZE - count;
      debug('starting to generate keys (%d)', keysToCreate);
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
          debug('done creating keys');
          cb(err);
        }
      );
    }
  });
}
