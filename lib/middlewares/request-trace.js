/**
 * @module lib/middlewares/request-trace
 */
'use strict';

//var clsMongoose = require('cls-mongoose');
var createNamespace = require('continuation-local-storage').createNamespace;
//var getNamespace = require('continuation-local-storage').getNamespace;
var uuid = require('node-uuid');
var shimmer = require('shimmer');
var mongoose = require('mongoose');

var namespace = createNamespace('runnable');
//clsMongoose(namespace);

shimmer.wrap(require('async'),
             'parallel',
             function (original) {
  return function (fns, cb) {
    cb = namespace.bind(cb);
    original.call(this, fns, cb);
  };
});

shimmer.wrap(mongoose.Mongoose.prototype.Promise.prototype, 'on', function (original) {
  return function(event, callback) {
    callback = namespace.bind(callback);
    return original.call(this, event, callback);
  };
});

module.exports = function (req, res, next) {
  namespace.run(function () {
    namespace.set('tid', uuid.v4());
    next();
  });
};

module.exports.namespace = namespace;

module.exports.setTidHeader = function (req, res, next) {
  res.set('runnable-tid', namespace.get('tid'));
  next();
};
