'use strict';

var debug = require('debug')('runnableApi:docklet:model');

var util = require('util');
var configs = require('configs');
var redis = require('models/redis');
var Boom = require('dat-middleware').Boom;
var ApiClient = require('simple-api-client');

module.exports = Docklet;

function Docklet () {
  this.url = '';
  this.request = this.request.defaults({ json:true, pool:false });
}

util.inherits(Docklet, ApiClient);

// this sets a new dock for the project
Docklet.prototype.findDock = function (cb) {
  var self = this;
  if (self.url) {
    return cb(null, self.url);
  }
  // get current box
  redis.lindex('docks:active', 0, function(err, dockerHost) {
    if(err) {
      debug('error getting active dock');
      return cb(Boom.gatewayTimeout('failed to pop active dock from redis: '+err.message));
    }
    if(!dockerHost) {
      debug('error no active docks in redis');
      return cb(Boom.gatewayTimeout('no active docks in redis'));
    }
    // get current box number
    redis.incr('docks:'+dockerHost, function(err, projectCount) {
      if(err) {
        debug('error incrementing dock project count');
        return cb(Boom.gatewayTimeout('failed to incr dock in redis: '+err.message));
      }
      // if over limit move box to full and return error
      // client should retry in this case
      if (projectCount >= configs.dockProjectLimit) {
        require('child_process').exec(configs.deployCommand);
        redis.lpush('docks:full', dockerHost, function(err) {
          if (err) {
            debug('error pushing filled dock to full set');
            return cb(Boom.gatewayTimeout('failed to lpush full dock to redis: '+err.message));
          }
          redis.lpop('docks:active', function (err) {
            if (err) {
              return cb(Boom.gatewayTimeout('failed to remove dock from redis: ' + err.message));
            }
            return cb(null, dockerHost);
          });
        });
      } else {
        return cb(null, dockerHost);
      }
    });
  });
};
