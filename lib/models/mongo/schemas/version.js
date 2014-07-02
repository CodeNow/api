'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

// var debug = require('debug')('runnable-api:version:model');
var extend = require('lodash').extend;
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;


/** @alias module:models/version */
var VersionSchema = module.exports = new Schema({
  // the ID of this object will be the docker tag
  /** type: string */
  // Not empty, length
  message: {
    type: String,
    default: '',
    validate: validators.description({model:"Version", literal: "Message"})
  },
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
  /** type: ObjectId */
  config: {
    type: ObjectId,
    index: true,
    required: 'Versions require a Config',
    validate: validators.objectId({model:"Version", literal: "Config"})
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  /** Dock box this context lives on
   * @type string */
  dockerHost: {
    type: String,
    validate : validators.dockerHost({model: "Version"})
  },
  /** type: ObjectId */
  context: {
    type: ObjectId,
    index: true,
    required : 'Versions require a Context',
    validate : validators.objectId({model:"Version", literal: "Context"})
  },
  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    validate : validators.objectId({model:"Version", literal: "InfraCodeVersion"})
  },
  appCodeVersions: [{
    // auto id
    repo: {
      type: String,
      validate: validators.stringLengthValidator({model: "Version",
          literal: "AppCodeVersions Repo"}, 200)
    },
    commit: {
      type: String,
      validate: validators.stringLengthValidator({model: "Version",
          literal: "AppCodeVersions Commit"}, 200)
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
      type: Date
    },
    dockerImage: {
      type: String,
      validate: validators.stringLengthValidator({model: "Version", literal: "Build Docker Image"},
          200)
    },
    dockerTag: {
      type: String,
      validate : validators.description({model:"Version", literal: "Build Docker Tag"})
    }
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });
