/**
 * Centrally load & handle init/deinit of event models
 * @module lib/models/events/index
 */
'use strict';

var domain = require('domain');
var Boom = require('dat-middleware').Boom;

var dockerEvents = require('models/events/docker');
var error = require('error');

module.exports = new Events();

var d = domain.create();
d.on('error', error.log);

/**
 * @class
 */
function Events () {
  this.connected = false;
}

/**
 * Initialize event handling models
 * @param {Function} cb
 */
Events.prototype.listen = function (cb) {
  if (this.connected) {
    return cb(Boom.conflict('events were already started'));
  }
  var self = this;
  d.run(function () {
    self.connected = true;
    self.dockerEvents = dockerEvents;
    self.dockerEvents.listen(cb);
  });
};

/**
 * Cease listening to emitted events
 * @param {Function} cb
 */
Events.prototype.close = function (cb) {
  this.connected = false;
  if (this.dockerEvents) {
    this.dockerEvents.close(cb);
  }
  else {
    cb();
  }
};
