'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:environment:model');
var Boom = require('dat-middleware').Boom;

var EnvironmentSchema = module.exports = new Schema({
  owner: {
    required: 'Environments require an Owner',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
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
EnvironmentSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
EnvironmentSchema.post('validate', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been validated (but not saved yet)', doc);
});
EnvironmentSchema.post('save', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been saved', doc);
});
EnvironmentSchema.post('remove', function (doc) {
  debug('*** ENVIRONMENT ****  %s has been removed', doc);
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
EnvironmentSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id');

EnvironmentSchema.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('env - you need a github userid as the owner'));
  } else {
    next();
  }
});
