'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */
var mongoose = require('mongoose');

var ContainerSchema = require('models/mongo/schemas/container');

module.exports = mongoose.model('Container', ContainerSchema);
