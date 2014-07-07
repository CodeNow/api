'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createMongooseMiddleware = require('../create-mongoose-middleware');

var mongoMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/mongo folder
// if they donot exist in teh middlewares/mongo folder


var mongoMiddlewaresDir = path.resolve(__dirname);
var excludes = ['index.js', 'base.js', 'project-envi', 'schemas'];

fs.readdirSync(mongoMiddlewaresDir).forEach(function (filename) {
  if (~excludes.indexOf(filename)) { return; }
  var plural = inflect.pluralize(filename.replace(/\.js$/, '').toLowerCase());
  var camel = inflect.camelize(inflect.underscore(plural), false);
  var middleware = require(path.join(mongoMiddlewaresDir, filename));
  mongoMiddlewares[camel] = middleware;
});


var mongoModelsDir = path.resolve(__dirname, '../../models/mongo/');

fs.readdirSync(mongoModelsDir).forEach(function (filename) {
  if (~excludes.indexOf(filename)) { return; }
  var plural = inflect.pluralize(filename.replace(/\.js$/, '').toLowerCase());
  var camel = inflect.camelize(inflect.underscore(plural), false);
  if (mongoMiddlewares[camel]) { return; }
  var Model = require(path.join(mongoModelsDir, filename));
  if (Model.name !== 'model') { return; }
  mongoMiddlewares[camel] = createMongooseMiddleware(Model);
});
