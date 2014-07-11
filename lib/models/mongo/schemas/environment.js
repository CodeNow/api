'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:environment:model');

module.exports = new Schema({
  owner: {
    runnable: {
      type: ObjectId,
      validate: validators.objectId({ model: 'Owner', literal: 'Runnable Owner' })
    },
    github: {
      type: Number,
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
    }
  },
  name: {
    type: String,
    required: 'Environments require a name',
    validate: validators.alphaNumName({model:'Environment', literal: 'Name'})
  }
});
// module.exports.post('init', function (doc) {
//  console.log('*** ENVIRONMENT ****  %s has been initialized from the db', doc);
// });
module.exports.pre('validate', function (next) {
  // Do validation here
  next();
});
module.exports.post('validate', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been validated (but not saved yet)', doc);
});
module.exports.post('save', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been saved', doc);
});
module.exports.post('remove', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been removed', doc);
});
