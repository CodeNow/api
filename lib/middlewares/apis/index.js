'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createClassMiddleware = require('../create-class-middleware');

var apiMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/apis folder
// if they donot exist in the middlewares/apis folder


var apiMiddlewaresDir = path.resolve(__dirname);

fs.readdirSync(apiMiddlewaresDir).forEach(function (filename) {
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(apiMiddlewaresDir, filename));

  apiMiddlewares[lower] = middleware;
});


var apiModelsDir = path.resolve(__dirname, '../../models/apis/');

fs.readdirSync(apiModelsDir).forEach(function (filename) {
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (apiMiddlewares[lower]) { return; }

  var Model = require(path.join(apiModelsDir, filename));
  console.log(Model.name, lower);
  apiMiddlewares[lower] = createClassMiddleware(lower, Model);
});
