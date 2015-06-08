/**
 * @module lib/models/mongo/schemas/build-history
 */
'use strict';

var mongoose = require('mongoose');

//var BuildSchema = require('models/mongo/schemas/build');

var Schema = mongoose.Schema;
//var ObjectId = Schema.ObjectId;

module.exports = new Schema({
  build: {},
  date: {
    type: Date,
    'default': Date.now
  }
});
