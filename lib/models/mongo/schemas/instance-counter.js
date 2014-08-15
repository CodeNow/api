'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

module.exports = new Schema({
  build: ObjectId,
  count: {
    type: Number
  }
});
