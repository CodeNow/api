'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var BaseSchema = require('models/mongo/schemas/base');
var assign = require('101/assign');

var UserWhitelistSchema = module.exports = new Schema({
  name: {
    type: String,
    required: 'whitelist requires a name'
  },
  lowerName: {
    type: String,
    required: 'whitelist requires lowerName',
    index: { unique: true }
  },
  allowed: {
    type: Boolean,
    'default': false
  }
});

UserWhitelistSchema.path('name').set(function (name) {
  this.lowerName = name.toLowerCase();
  return name;
});

UserWhitelistSchema.index({ lowerName: 1, allowed: 1 });

assign(UserWhitelistSchema.methods, BaseSchema.methods);
assign(UserWhitelistSchema.statics, BaseSchema.statics);

