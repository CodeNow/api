/**
 * @module lib/models/mongo/schemas/build-history
 */
'use strict';

var mongoose = require('mongoose');
var debug = require('debug')('runnable-api:build-history:model');

var BuildHistorySchema = module.exports = new mongoose.Schema({
  commitHashId: {
    type: String
  },
  //icv
  org: {
    type: String
  },
  date: {
    type: Date,
    'default': Date.now
  },
  outcome: String
});
