'use strict';

var debug = require('debug');

module.exports = Timers;

function Timers () {
  this.timers = {};
}

Timers.prototype.debug = function (name, message) {
  debug('runnable-api:timer:' + name)(message);
};

Timers.prototype.startTimer = function (name) {
  var self = this;
  return function (req, res, next) {
    if (self.timers[name]) {
      self.debug(name, 'timer has already been started');
      return next();
    }
    self.timers[name] = process.hrtime();
    next();
  };
};

Timers.prototype.stopTimer = function (name) {
  var self = this;
  return function (req, res, next) {
    if (!self.timers[name]) {
      self.debug(name, 'timer does not exist');
      return next();
    }
    var stop = process.hrtime(self.timers[name]);
    self.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms');
    delete self.timers[name];
    next();
  };
};
