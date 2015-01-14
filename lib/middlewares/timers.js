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
        Timers.debug(name, 'timer has already been started');
        return next();
      }
      Timers.timers[name] = process.hrtime();
      next();
    };
  },
  stopTimer: function (name) {
    return function (req, res, next) {
      if (!Timers.timers[name]) {
        Timers.debug(name, 'timer does not exist');
        return next();
      }
      var stop = process.hrtime(Timers.timers[name]);
      Timers.debug(name, stop[0] + 's, ' + stop[1] / 1000000 + 'ms');
      delete Timers.timers[name];
      next();
    };
  }
};
