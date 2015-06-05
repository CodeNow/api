/**
 * @module lib/models/mongo/schemas/build-history
 */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var ObjectId = Schema.ObjectId;
var debug = require('debug')('runnable-api:build-history:model');

var BuildHistorySchema = module.exports = new Schema({
  build: Schema.Types.Mixed,
  date: {
    type: Date,
    'default': Date.now
  }
});
