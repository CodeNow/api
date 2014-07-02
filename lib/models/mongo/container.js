'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var Boom = require('dat-middleware').Boom;

var debug = require('debug')('runnableApi:context:model');
var mongoose = require('mongoose');
var Boom = require('dat-middleware').Boom;

var ContainerSchema = require('models/mongo/schemas/container');

module.exports = mongoose.model('Container', ContainerSchema);
