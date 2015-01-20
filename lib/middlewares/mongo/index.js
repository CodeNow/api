'use strict';

var path = require('path');
var createMongooseMiddleware = require('../create-mongoose-middleware');

module.exports = require('middlewares/middlewarize-dir')(
  __dirname,
  path.resolve(__dirname, '../../models/mongo/'),
  createMongooseMiddleware,
  function (filename) {
    return filename !== 'mongoose-control.js';
  },
  true);