'use strict';

/**
 * Version middleware
 * @module middleware/versions
 */

var createMongooseMiddleware = require('./createMongooseMiddleware');
var Version = require('models/versions');

module.exports = createMongooseMiddleware(Version, {});
