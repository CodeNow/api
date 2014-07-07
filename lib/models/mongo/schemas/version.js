'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var extend = require('lodash').extend;
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:build:middleware');

/** @alias module:models/version */
var VersionSchema = module.exports = new Schema({
  /** type: ObjectId */
  owner: {
    type: ObjectId,
    index: true,
    required: 'Versions require an Owner',
    validate: validators.objectId({model:"Version", literal: "Owner"})
  },
  /** type: ObjectId */
  createdBy: {
    type: ObjectId,
    index: true,
    required: 'Versions require a CreatedBy User',
    validate: validators.objectId({model:"Version", literal: "CreatedBy"})
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: "Version", literal: "Created"})
  },
  /** Dock box this context lives on
   * @type string */
  dockerHost: {
    type: String,
    validate: validators.dockerHost({model: "Version"})
  },
  // FIXME: require environment
  /** type: ObjectId */
  context: {
    type: ObjectId,
    index: true,
    required: 'Versions require a Context',
    validate: validators.objectId({model:"Version", literal: "Context"})
  },
  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    // required: 'Context Versions requires an Infrastructure Code Version',
    validate: validators.objectId({model:"Version", literal: "InfraCodeVersion"})
  },
  appCodeVersions: [{
    // auto id
    repo: {
      type: String,
      validate: validators.stringLengthValidator({
        model: "Version",
        literal: "AppCodeVersions Repo"
      }, 200)
    },
    commit: {
      type: String,
      validate: validators.stringLengthValidator({
        model: "Version",
        literal: "AppCodeVersions Commit"
      }, 200)
    }
  }],
  /** type: object */
  build: {
    message: {
      type: String,
      validate: validators.description({model:"Version", literal: "Message"})
    },
    triggeredBy: { // appCode *or* rebuild
      infraCode: Boolean,
      appCode: Boolean,
      rebuild: Boolean
    },
    duration: {
      type: Date
    },
    created: { // time build finished
      type: Date,
      validate: validators.beforeNow({model: "Version", literal: "Build Created"})
    },
    dockerImage: {
      type: String,
      validate: validators.stringLengthValidator({
        model: "Version",
        literal: "Build Docker Image"
      }, 200)
    },
    dockerTag: {
      type: String,
      validate: validators.description({model:"Version", literal: "Build Docker Tag"})
    }
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });
// VersionSchema.post('init', function (doc) {
//  console.log('*** VERSION ****  %s has been initialized from the db', doc);
// });
VersionSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
VersionSchema.post('validate', function (doc) {
  debug('*** VERSION ****  %s has been validated (but not saved yet)', doc);
});
VersionSchema.post('save', function (doc) {
  debug('*** VERSION ****  %s has been saved', doc);
});
VersionSchema.post('remove', function (doc) {
  debug('*** VERSION ****  %s has been removed', doc);
});

