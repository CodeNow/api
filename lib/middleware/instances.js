'use strict';

/**
 * Instance middleware
 * @module middleware/instances
 */
var createMongooseMiddleware = require('./createMongooseMiddleware');
var Instance = require('models/instances');

module.exports = createMongooseMiddleware(Instance, {});
