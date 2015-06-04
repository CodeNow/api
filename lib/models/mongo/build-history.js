/**
 * Track history of all builds in mongo for product team
 * @module lib/models/mongo/build-history
 */
'use strict';

var mongoose = require('mongoose');
var debug = require('debug')('runnable-api:build-history:model');

var BuildHistorySchema = require('models/mongo/schemas/build-history');

/**
 * @param {Object} buildInfo - build information returned by docker
 */
BuildHistorySchema.methods.updateBuildInfo = function (buildInfo) {
  this.log = buildInfo.log;
  this.success = !!buildInfo.failed;
};

var BuildHistory = module.exports = mongoose.model('BuildHistory', BuildHistorySchema);
