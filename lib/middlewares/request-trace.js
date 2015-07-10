/**
 * https://datahero.com/blog/2014/05/22/node-js-preserving-data-across-async-callbacks/
 * @module lib/middlewares/request-trace
 */
'use strict';

//var getNamespace = require('continuation-local-storage').getNamespace;

var createNamespace = require('continuation-local-storage').createNamespace;
var uuid = require('node-uuid');
var shimmer = require('shimmer');
var mongoose = require('mongoose');

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
  if (!namespace.get('tid')) {
    console.log('initializing namespace');
    namespace.run(function () {
      namespace.set('tid', uuid.v4());
      next();
    });
  }
  else {
    console.log('namespace already initialized');
    next();
  }
};

module.exports.namespace = namespace;

/**
 * set response header w/ TID. Invoke at end of route 
 * in order to verify namespace was not lost during route.
 */
module.exports.setTidHeader = function (req, res, next) {
  if (!res._headers['runnable-tid']) {
    res.set('runnable-tid', namespace.get('tid'));
  }
  next();
};
