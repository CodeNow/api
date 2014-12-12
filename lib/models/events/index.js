'use strict';
var domain = require('domain');

var error = require('error');
var Boom = require('dat-middleware').Boom;

var d = domain.create();
d.on('error', error.log);


function Events () {
  this.connected = false;
}

Events.prototype.listen = function (cb) {
  if (this.connected) {
    return cb(Boom.conflict('events were already started'));
  }
  var self = this;
  d.run(function () {
    self.connected = true;
    self.dockerEvents = require('./docker');
    self.dockerEvents.listen(cb);
  });
};

Events.prototype.close = function (cb) {
  this.connected = false;
  if (this.dockerEvents) {
    this.dockerEvents.close(cb);
  }
  else {
    cb();
  }
};

module.exports = new Events();