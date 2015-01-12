'use strict';

var debug = require('debug');

var Timers = module.exports = {
  timers: {},
  debug: function (name, message) {
    debug('runnable-api:timer:' + name)(message);
  },
  startTimer: function (name) {
    return function (req, res, next) {
      if (Timers.timers[name]) {
        return Timers.debug(name, 'timer has already been started');
      }
      Timers.timers[name] = process.hrtime();
      next();
    };
  },
  stopTimer: function (name) {
    return function (req, res, next) {
      var stop = process.hrtime(Timers.timers[name]);
      if (!Timers.timers[name]) {
        return Timers.debug(name, 'timer does not exist');
      }
      Timers.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms');
      delete Timers.timers[name];
      next();
    };
  }
};
