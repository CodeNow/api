'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */
var mongoose = require('mongoose');

var EnvironmentSchema = require('models/mongo/schemas/environment');

module.exports = mongoose.model('Environment', EnvironmentSchema);
