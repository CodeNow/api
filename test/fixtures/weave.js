var weave = require('sauron/lib/engines/weave-wrapper');
var extend = require('extend');

// Mocks for weave
extend(weave, {
  status: function (opts, cb) {
    return cb('already up');
  },
  launch: function (opts, cb) {
    return cb(null, 'mock');
  },
  attach: function (opts, cb) {
    return cb(null, 'mock');
  },
  detach: function (opts, cb) {
    return cb(null, 'mock');
  },
  runCmd: function (opts, cb) {
    return cb(null, 'mock');
  },
});

module.exports = weave;