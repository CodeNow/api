'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createClassMiddleware = require('../create-class-middleware');

var analyticsMiddleware = module.exports = {};

// this file automatically generates middlewares from the models/analytics folder
// if they donot exist in the middlewares/analytics folder

var analyticsMiddlewareDir = path.resolve(__dirname);
var middlewaresIncludes = [];

fs.readdirSync(analyticsMiddlewareDir).forEach(function (filename) {
  if (!~middlewaresIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(analyticsMiddlewareDir, filename));
  var camel =  inflect.camelize(inflect.underscore(lower), false);
  analyticsMiddleware[camel] = middleware;
});


var analyticsModelsDir = path.resolve(__dirname, '../../models/analytics/');
var modelsIncludes = ['index.js'];

fs.readdirSync(analyticsModelsDir).forEach(function (filename) {
  if (!~modelsIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (analyticsMiddleware[lower]) { return; }

  var Model = require(path.join(analyticsModelsDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  analyticsMiddleware[camel] = createClassMiddleware(camel, Model);
});