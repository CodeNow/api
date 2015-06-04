/**
 * Track history of all builds in mongo for product team
 * @module lib/models/mongo/build-history
 */
'use strict';

var mongoose = require('mongoose');
var debug = require('debug')('runnable-api:build-history:model');

var BuildHistorySchema = require('models/mongo/schemas/build-history');

var BuildHistory = module.exports = mongoose.model('BuildHistory', BuildHistorySchema);
