'use strict';

var debug = require('debug');

module.exports = Timers;

function Timers () {
  this.timers = {};
}

Timers.prototype.debug = function (name, message) {
  debug('runnable-api:timer:' + name)(message);
};

Timers.prototype.startTimer = function (name, cb) {
  if (this.timers[name]) {
    this.debug(name, 'timer has already been started');
    return cb();
  }
  this.timers[name] = process.hrtime();
  cb();
};

Timers.prototype.stopTimer = function (name, cb) {
  if (!this.timers[name]) {
    this.debug(name, 'timer does not exist');
    return cb();
  }
  var stop = process.hrtime(this.timers[name]);
  this.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms');
  delete this.timers[name];
  cb();
};
