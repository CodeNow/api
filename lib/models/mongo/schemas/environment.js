'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

module.exports = new Schema({
  owner: ObjectId,
  name: String,
  outputViews: {
    type: [{
      // FIXME: expand these as needed!
      name: String,
      type: String
    }],
    'default': []
  }
});