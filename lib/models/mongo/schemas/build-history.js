/**
 * @module lib/models/mongo/schemas/build-history
 */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var ObjectId = Schema.ObjectId;
var debug = require('debug')('runnable-api:build-history:model');

var BuildHistorySchema = module.exports = new Schema({
  icv: Schema.Types.Mixed,
  cv: Schema.Types.ObjectId,
  acvs: Schema.Types.Mixed,
  ownder: String,
  date: {
    type: Date,
    'default': Date.now
  },
  log: String,
  success: Boolean
});
