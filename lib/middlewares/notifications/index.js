'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createClassMiddleware = require('../create-class-middleware');

var apiMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/notifications folder
// if they donot exist in the middlewares/notifications folder


var notificationsMiddlewaresDir = path.resolve(__dirname);
var middlewaresIncludes = [];

fs.readdirSync(notificationsMiddlewaresDir).forEach(function (filename) {
  if (!~middlewaresIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(notificationsMiddlewaresDir, filename));
  var camel =  inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = middleware;
});


var notificationsModelsDir = path.resolve(__dirname, '../../models/notifications/');
var modelsIncludes = ['index.js'];

fs.readdirSync(notificationsModelsDir).forEach(function (filename) {
  if (!~modelsIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (apiMiddlewares[lower]) { return; }

  var Model = require(path.join(notificationsModelsDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = createClassMiddleware(camel, Model);
});