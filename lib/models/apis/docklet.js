'use strict';

var debug = require('debug')('runnable-api:docklet:model');

var util = require('util');
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
  // get current box - anands code yanked from master
  // FIXME: abstract these lists using tjmehta/redis-types
  redis.lpop('docks:active', function(err, dockerHost) {
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
      if (projectCount >= process.env.DOCK_PROJECT_LIMIT) {
        redis.lpush('docks:full', dockerHost, function(err) {
          if(err) {
            debug('error pushing filled dock to full set');
            return cb(Boom.gatewayTimeout('failed to lpush full dock to redis: '+err.message));
          }
          return cb(Boom.resourceGone('dock full'));
        });
      }
      // if we are at the limit spin up a new box and continue
      if (projectCount === process.env.DOCK_PROJECT_LIMIT) {
        require('child_process').exec(process.env.DEPLOY_COMMAND);
      }
      redis.rpush('docks:active', dockerHost, function(err) {
        if(err) {
          debug('error pushing dock back into active');
          return cb(Boom.gatewayTimeout('failed to rpush active dock to redis: '+err.message));
        }
        self.url = dockerHost;
        return cb(null, dockerHost);
      });
    });
  });
};
