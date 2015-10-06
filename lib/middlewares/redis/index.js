/**
 * @module lib/middlewares/redis/index
 */
'use strict';

var modelsIncludes = ['hosts.js'];
var path = require('path');
var createClassMiddleware = require('middlewares/create-class-middleware');

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/redis/'),
  createClassMiddleware,
  function (filename) {
    return ~modelsIncludes.indexOf(filename);
  });
