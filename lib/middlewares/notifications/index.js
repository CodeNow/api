'use strict';

var path = require('path');
var createClassMiddleware = require('../create-class-middleware');

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/notifications/'),
  createClassMiddleware);