'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:build:middleware');

module.exports = new Schema({
  owner: {
    type: ObjectId,
    index: true,
    required: 'Environments require an Owner',
    validate: validators.objectId({model:"Environment", literal: "Owner"})
  },
  name: {
    type: String,
    required: 'Environments require a name',
    validate: validators.alphaNumName({model:"Environment", literal: "Name"})
  }
});
module.exports.post('init', function (doc) {
//  console.log('*** CONTEXT ****  %s has been initialized from the db', doc);
});
module.exports.pre('validate', function (next) {
  // Do validation here
  next();
});
module.exports.post('validate', function (doc) {
  debug('*** CONTEXT ****  %s has been validated (but not saved yet)', doc);
});
module.exports.post('save', function (doc) {
  debug('*** CONTEXT ****  %s has been saved', doc);
});
module.exports.post('remove', function (doc) {
  debug('*** CONTEXT ****  %s has been removed', doc);
});