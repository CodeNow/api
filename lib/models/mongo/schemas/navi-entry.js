/**
 * Navi instance routing data
 * @module models/schemas/navi-entry
 */
'use strict';

var mongoose = require('mongoose');

//var ObjectId = mongoose.Schema.ObjectId;
var Schema = mongoose.Schema;

var NaviEntry = module.exports = new Schema({
  elasticUrl: {
    type: String,
    required: true,
    index: {
      unique: true
    }
  },
  directUrls: {},
  userMappings: {},
  ownerGithubId: {
    type: Number,
    required: true
  }
});

NaviEntry.index({
  elasticUrl: 1
}, {
  unique: true
});
