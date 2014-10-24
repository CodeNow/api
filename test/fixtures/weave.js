var weave = require('sauron/lib/engines/weave-wrapper');
var extend = require('extend');

var attached = {};

// Mocks for weave
extend(weave, {
  status: function (opts, cb) {
    return cb('already up');
  },
  launch: function (opts, cb) {
    return cb(null, 'mock');
  },
  attach: function (opts, cb) {
    attached[opts.containerId] = opts.ipaddr;
    return cb(null, 'mock');
  },
  detach: function (opts, cb) {
    delete attached[opts.containerId];
    return cb(null, 'mock');
  },
  runCmd: function (opts, cb) {
    return cb(null, 'mock');
  },
});

// Test access for weave
weave.hostIpForContainer = function (containerId) {
  return attached[containerId];
};
weave.clean = function (cb) {
  attached = {};
  cb();
};

module.exports = weave;