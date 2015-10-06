/**
 * @module lib/middlewares/slack/index
 */
'use strict';

var path = require('path');
var createClassMiddleware = require('middlewares/create-class-middleware');

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../notifications/'),
  createClassMiddleware);
