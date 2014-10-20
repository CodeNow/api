var weaveWrapper = require('sauron/lib/models/weave-wrapper');
var extend = require('extend');

// Mocks for weave
extend(weaveWrapper, {
  status: function (opt, cb) {
    return cb('already up');
  },
  launch: function (opt, cb) {
    return cb(null, 'mock');
  },
  attach: function (opt, cb) {
    return cb(null, 'mock');
  },
  detach: function (opt, cb) {
    return cb(null, 'mock');
  },
  runCmd: function (opt, cb) {
    return cb(null, 'mock');
  },
});

module.exports = require('sauron');