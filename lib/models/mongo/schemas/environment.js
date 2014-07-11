'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:environment:model');
var Boom = require('dat-middleware').Boom;

module.exports = new Schema({
  owner: {
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

module.exports.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('env - you need a github userid as the owner'));
  } else {
    next();
  }
});
