'use strict';

var path = require('path');
var fs = require('fs');
var camelize = require('camelize');
var createClassMiddleware = require('../create-class-middleware');

var apiMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/redis folder
// if they donot exist in the middlewares/redis folder


var apiMiddlewaresDir = path.resolve(__dirname);

fs.readdirSync(apiMiddlewaresDir).forEach(function (filename) {
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(apiMiddlewaresDir, filename));
  var camel = camelize(lower);
  apiMiddlewares[camel] = middleware;
});


var apiModelsDir = path.resolve(__dirname, '../../models/redis/');

fs.readdirSync(apiModelsDir).forEach(function (filename) {
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (apiMiddlewares[lower]) { return; }

  var Model = require(path.join(apiModelsDir, filename));
  var camel = camelize(lower);
  apiMiddlewares[camel] = createClassMiddleware(camel, Model);
});
