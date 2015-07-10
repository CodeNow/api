/**
 * @module lib/middlewares/continuation-local-storage
 */
'use strict';

var clsMongoose = require('cls-mongoose');
var createNamespace = require('continuation-local-storage').createNamespace;
//var getNamespace = require('continuation-local-storage').getNamespace;
var uuid = require('node-uuid');
var shimmer = require('shimmer');

var namespace = createNamespace('runnable');
clsMongoose(namespace);

shimmer.wrap(require('async'),
             'parallel',
             function (original) {
  return function (fns, cb) {
    cb = namespace.bind(cb);
    original.call(this, fns, cb);
  };
});

module.exports = function (req, res, next) {
  namespace.run(function () {
    namespace.set('tid', uuid.v4());
    next();
  });
};

module.exports.namespace = namespace;
