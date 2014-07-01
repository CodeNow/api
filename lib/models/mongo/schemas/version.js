'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var debug = require('debug')('runnableApi:version:model');
var extend = require('lodash').extend;
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;


/** @alias module:models/version */
var VersionSchema = module.exports = new Schema({
  /** type: ObjectId */
  owner: ObjectId,
  /** type: ObjectId */
  createdBy: ObjectId,
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },

  /** type: ObjectId */
  config: ObjectId,
  /** type: ObjectId */
  context: ObjectId,

  /** Dock box this context lives on
   * @type string */
  dockerHost: {
    type: String
  },

  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion'
  },
  appCodeVersions: [{
    // auto id
    repo: {
      type: String
    },
    commit: {
      type: String
    }
  }],
  /** type: object */
  build: {
    message: {
      type: String
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
      type: String
    },
    dockerTag: {
      type: String
    },
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });
