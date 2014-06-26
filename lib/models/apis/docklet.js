'use strict';

var debug = require('debug')('runnableApi:docklet:model');

var util = require('util');
var configs = require('configs');
var redis = require('models/redis');

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
  redis.rpoplpush("docks:active", "docks:active", function(err, dockerHost) {
    if(err) {
      debug('error getting active dock');
      return cb(err);
    }
    if(!dockerHost) {
      debug('error no active docks in redis');
      return cb(new Error('no active docks in redis'));
    }
    // get current box number
    redis.incr("docks:"+dockerHost, function(err, projectCount) {
      if(err) {
        debug('error incrementing dock project count');
        return cb(err);
      }
      // if over limit move box to full and return error
      // client should retry in this case
      if (projectCount >= configs.dockProjectLimit) {
        redis.rpoplpush("docks:full", function(err) {
          if(err) {
            debug('error pushing filled dock to full set');
            return cb(err);
          }
          return cb(new Error('dock full'));
        });
      }
      // if we are at the limit spin up a new box and continue
      if (projectCount === configs.dockProjectLimit) {
        require('child_process').exec(configs.deployCommand);
      }
      self.url = dockerHost;
      return cb(null, dockerHost);
    });
  });
};