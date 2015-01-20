'use strict';

var debug = require('debug');
var isFunction = require('101/is-function');

module.exports = Timers;

function Timers () {
  this.timers = {};
}

Timers.prototype.debug = function (name, message) {
  debug('runnable-api:timer:' + name)(message);
};

Timers.prototype.startTimer = function (name, cb) {
  if (isFunction(name)) {
    cb = name;
    return cb(new Error('timers require a name'));
  }
  if (this.timers[name]) {
    this.debug(name, 'timer has already been started');
    return cb(new Error('timer ' + name + ' already exists'));
  }
  this.timers[name] = process.hrtime();
  cb();
};

Timers.prototype.stopTimer = function (name, cb) {
  if (isFunction(name)) {
    cb = name;
    return cb(new Error('timers require a name'));
  }
  if (!this.timers[name]) {
    this.debug(name, 'timer does not exist');
    return cb(new Error('timer ' + name + ' does not exist'));
  }
  var stop = process.hrtime(this.timers[name]);
  this.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms');
  delete this.timers[name];
  cb();
};
