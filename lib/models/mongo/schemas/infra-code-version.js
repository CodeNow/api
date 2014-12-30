'use strict';

var extend = require('extend');
var BaseSchema = require('./base');
var Schema = require('mongoose').Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:infra-code-version:model');
var path = require('path');

var FileSchema = new Schema({
  Key: {
    type: String,
    required: true
  },
  ETag: {
    type: String,
    required: true
  },
  VersionId: {
    type: String,
    required: true
  },
  isDir: {
    type: Boolean,
    default: false
  }
});

FileSchema.set('toJSON', { virtuals: true });
FileSchema.virtual('name').get(function () {
  var firstSlash = this.Key.indexOf('/');
  var secondSlash = this.Key.indexOf('/', firstSlash + 1);
  var key = this.Key.slice(secondSlash);
  return path.basename(key);
});
FileSchema.virtual('path').get(function () {
  var firstSlash = this.Key.indexOf('/');
  var secondSlash = this.Key.indexOf('/', firstSlash + 1);
  var key = this.Key.slice(secondSlash);
  var returnPath;
  if (key.slice(-1) === '/') {
    returnPath = path.dirname(key.slice(0, key.lastIndexOf('/')));
    returnPath = returnPath === '.' ? '' : path.join(returnPath, '/');
  } else {
    returnPath = path.dirname(key);
  }
  return returnPath;
});

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
  edited: {
    type: Boolean,
    'default': false
    // We're defaulting this to false for source files.  All of the infracode routes that create
    // files set edited to true
  },
  /* s3 file versions */
  files: {
    type: [FileSchema],
    'default': [],
    index: true
  },
  parent: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    validate: validators.objectId({
      model: 'Infrastructure Code Version',
      literal: 'Parent InfraCodeVersion'
    })
  },
  environment: {
    type: ObjectId,
    ref: 'Environment',
    validate: validators.objectId({
      model: 'Infrastructure Code Version',
      literal: 'Environment'
    })
  },
  parentEnvironment: {
    type: ObjectId,
    ref: 'Environment',
    validate: validators.objectId({
      model: 'Infrastructure Code Version',
      literal: 'Parent Environment'
    })
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'ContextVersion', literal: 'Created'})
  },
   /** type: object */
  hashs: {
    type: Object
  },
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
