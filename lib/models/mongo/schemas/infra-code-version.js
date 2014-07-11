'use strict';

var extend = require('extend');
var BaseSchema = require('./base');
var Schema = require('mongoose').Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:infra-code-version:model');

var InfraCodeVersionSchema = new Schema({
  /* Currently infrastructure code is tied to a context, in the future it could
   * be tied to an infrastructure with some name like api-infrastructure.
   */
  /***
   * @type: ObjectId
   **/
  context: {
    type: ObjectId,
    ref: 'Context',
    required: 'Infrastructure Code Versions require a Context',
    validate: validators.objectId({model:'Infrastructure Code Version', literal: 'Context'})
  },
  /* s3 file versions */
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String,
      isDir: Boolean
    }],
    'default': []
  }
});

extend(InfraCodeVersionSchema.methods, BaseSchema.methods);
extend(InfraCodeVersionSchema.statics, BaseSchema.statics);

module.exports = InfraCodeVersionSchema;
// InfraCodeVersionSchema.post('init', function (doc) {
//  console.log('*** InfraCodeVersion ****  %s has been initialized from the db', doc);
// });
InfraCodeVersionSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
InfraCodeVersionSchema.post('validate', function (doc) {
  debug('*** InfraCodeVersion ****  %s has been validated (but not saved yet)', doc);
});
InfraCodeVersionSchema.post('save', function (doc) {
  debug('*** InfraCodeVersion ****  %s has been saved', doc);
});
InfraCodeVersionSchema.post('remove', function (doc) {
  debug('*** InfraCodeVersion ****  %s has been removed', doc);
});
