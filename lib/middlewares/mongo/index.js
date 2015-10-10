/**
 * this file automatically generates middlewares from the models/mongo folder
 * if they do not exist in the middlewares/mongo folder
 * @module lib/middlewares/mongo/index
 */
'use strict';

var mongoMiddlewares = module.exports = {};

var fs = require('fs');
var inflect = require('i')();
var path = require('path');

var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');

var excludes = [
  'base.js',
  'index.js',
  'project-envi',
  'schemas'
];
var mongoModelsDir = path.resolve(__dirname, '../../models/mongo/');
var mongoMiddlewaresDir = path.resolve(__dirname);

/**
 * Find for each moddleware module in this directory (excluding 'excludes' list)
 * and attach to the exports of this module with a key that represents the name
 * of the model pluralized & camel-cased.
 */
fs.readdirSync(mongoMiddlewaresDir).forEach(function(filename) {
  if (~excludes.indexOf(filename)) {
    return;
  }
  var plural = inflect.pluralize(filename.replace(/\.js$/, '').toLowerCase());
  var camel = inflect.camelize(inflect.underscore(plural), false);
  var middleware = require(path.join(mongoMiddlewaresDir, filename));
  mongoMiddlewares[camel] = middleware;
});

/**
 * For each model in the mongoose-models directory, *middlewareize* by passing
 * as argument to createMongooseMiddleware. Ignore any models if there is already
 * a middleware defined with the same name.
 */
fs.readdirSync(mongoModelsDir).forEach(function(filename) {
  if (~excludes.indexOf(filename)) {
    return;
  }
  var plural = inflect.pluralize(filename.replace(/\.js$/, '').toLowerCase());
  var camel = inflect.camelize(inflect.underscore(plural), false);
  if (mongoMiddlewares[camel]) {
    return;
  }
  var Model = require(path.join(mongoModelsDir, filename));
  if (Model.name !== 'model') {
    return;
  }
  mongoMiddlewares[camel] = createMongooseMiddleware(Model);
});
