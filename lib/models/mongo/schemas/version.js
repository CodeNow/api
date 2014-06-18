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


/** @alias module:models/version */
var VersionSchema = module.exports = new Schema({
  // the ID of this object will be the docker tag
  /** type: string */
  name: { type: String },
  /** type: ObjectId */
  owner: ObjectId,
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  /** type: ObjectId */
  context: ObjectId,
  /** type: object */
  dockerfile: {
    type: {
      Key: String,
      ETag: String,
      VersionId: String
    }
  },
  /** type: Array.object */
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
  },
  /** type: object */
  build: {
    dockerImage: {
      type: String
    },
    dockerTag: {
      type: String
    }
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });