'use strict';

var path = require('path');
var fs = require('fs');
var inflect = require('i')();
var createClassMiddleware = require('../create-class-middleware');

var apiMiddlewares = module.exports = {};

// this file automatically generates middlewares from the models/redis folder
// if they donot exist in the middlewares/redis folder


var redisMiddlewaresDir = path.resolve(__dirname);
var middlewaresIncludes = [];

fs.readdirSync(redisMiddlewaresDir).forEach(function (filename) {
  if (!~middlewaresIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  var middleware = require(path.join(redisMiddlewaresDir, filename));
  var camel =  inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = middleware;
});


var redisModelsDir = path.resolve(__dirname, '../../models/redis/');
var modelsIncludes = ['hipache-hosts.js'];

fs.readdirSync(redisModelsDir).forEach(function (filename) {
  if (!~modelsIncludes.indexOf(filename)) { return; }
  var lower = filename.replace(/\.js$/, '').toLowerCase();
  if (apiMiddlewares[lower]) { return; }

  var Model = require(path.join(redisModelsDir, filename));
  var camel = inflect.camelize(inflect.underscore(lower), false);
  apiMiddlewares[camel] = createClassMiddleware(camel, Model);
});
