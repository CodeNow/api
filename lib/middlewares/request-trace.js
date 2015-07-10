/**
 * https://datahero.com/blog/2014/05/22/node-js-preserving-data-across-async-callbacks/
 * @module lib/middlewares/request-trace
 */
'use strict';

var createNamespace = require('continuation-local-storage').createNamespace;
var uuid = require('node-uuid');
var shimmer = require('shimmer');
var mongoose = require('mongoose');

//var log = require('logger').child({ module: 'middlewares:request-trace'}, true);

var namespace = createNamespace('runnable');

// TODO new npm module for below shims
// bind all uses of async.parallel
shimmer.wrap(require('async'),
             'parallel',
             function (original) {
  return function (fns, cb) {
    cb = namespace.bind(cb);
    original.call(this, fns, cb);
  };
});

// bind all mongoose model requests
shimmer.wrap(mongoose.Mongoose.prototype.Promise.prototype, 'on', function (original) {
  return function(event, callback) {
    callback = namespace.bind(callback);
    return original.call(this, event, callback);
  };
});

/**
 * Initialize namespace. Invoke at beginning of route.
 * Will not overwrite existing namespace when route is used
 * internally via express-request.
 */
module.exports = function (req, res, next) {
  if (arguments.length === 1) {
    // generator mode
    var overrideKey = arguments[0];
    overrideKey = 'TID_'+overrideKey;
    return function (req, res, next) {
      if (process.env[overrideKey]) {
        namespace.run(function () {
          namespace.set('tid', process.env[overrideKey]);
          next();
        });
      }
      else {
        initNamespace(next);
      }
    };
  }
  else {
    // middleware mode
    initNamespace(next);
  }
  function initNamespace (next) {
    //log.trace('request-trace');
    if (!namespace.get('tid')) {
      //log.trace('initializing namespace');
      namespace.run(function () {
        namespace.set('tid', uuid.v4());
        next();
      });
    }
    else {
      //log.trace('namespace already initialized');
      next();
    }
  }
};

module.exports.namespace = namespace;

/**
 * set response header w/ TID. Invoke at end of route
 * in order to verify namespace was not lost during route.
 */
module.exports.setTidHeader = function (req, res, next) {
  //log.trace('request-trace.setTidHeader');
  if (!res._headers['runnable-tid']) {
    //log.trace('request-trace.setTidHeader header already set');
    res.set('runnable-tid', namespace.get('tid'));
  }
  next();
};
