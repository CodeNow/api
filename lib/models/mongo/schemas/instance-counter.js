'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

module.exports = new Schema({
  isGlobal: {
    type: Boolean,
    default: false
  },
  count: {
    type: Number
  }
});
