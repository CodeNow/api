'use strict';

var path = require('path');
var fs = require('fs');
var createClassMiddleware = require('../create-class-middleware');
var inflect = require('i')();

var apiMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/apis folder
// if they donot exist in the middlewares/apis folder


var apiMiddlewaresDir = path.resolve(__dirname);

fs.readdirSync(apiMiddlewaresDir).forEach(function (filename) {
  if (~filename.indexOf('container') || !~filename.indexOf('.js')) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(apiMiddlewaresDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = middleware;
});


var apiModelsDir = path.resolve(__dirname, '../../models/apis/');

fs.readdirSync(apiModelsDir).forEach(function (filename) {
  if (~filename.indexOf('container') || !~filename.indexOf('.js')) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (apiMiddlewares[lower]) { return; }

  var Model = require(path.join(apiModelsDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = createClassMiddleware(camel, Model);
});
