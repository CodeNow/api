'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createClassMiddleware = require('../create-class-middleware');

var cayleyMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/cayley folder
// if they donot exist in the middlewares/cayley folder


var cayleyMiddlewaresDir = path.resolve(__dirname);
var middlewaresIncludes = [];

fs.readdirSync(cayleyMiddlewaresDir).forEach(function (filename) {
  if (!~middlewaresIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(cayleyMiddlewaresDir, filename));
  var camel =  inflect.camelize(inflect.underscore(lower), false);
  cayleyMiddlewares[camel] = middleware;
});


var cayleyModelsDir = path.resolve(__dirname, '../../models/cayley/');
var modelsIncludes = ['index.js'];

fs.readdirSync(cayleyModelsDir).forEach(function (filename) {
  if (!~modelsIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (cayleyMiddlewares[lower]) { return; }

  var Model = require(path.join(cayleyModelsDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  cayleyMiddlewares[camel] = createClassMiddleware(camel, Model);
});
