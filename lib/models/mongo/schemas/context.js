'use strict';
var extend = require('lodash').extend;

var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/context */
var ContextSchema = module.exports = new Schema({
  /** username/Name must be unique. This is used as the repository name for the Docker image
   *  (e.g. registry:port/namespace/repository -- namespace is the username,
   *  repository is this name)
   *  @type string */
  name: {
    type: String
  },
  /** @type string */
  displayName: { type: String },
  /** @type string */
  description: {
    type: String
  },
  /** Source references for the context.
   *  By default, each context will have a 'local' source, and an S3 bucket.
   *  This also can be used to reference a remote repository??
   *  @example [{ type: 'local', location: 's3://bucket/path/to/some/source' }]
   *  @type array.object */
  source: {
    type: [{
      sourceType : String,
      location: String
    }]
  },
  /** @type ObjectId */
  owner: {
    type: ObjectId,
    index: true
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** Versions of the images built of this context (by Docker)
   *  @property {array.ObjectId} versions[] IDs of versions associated with this context
   *  @type array.ObjectId */
  versions: {
    type: [{
      type: ObjectId,
      ref: 'Versions'
    }],
    'default': []
  },
  /** Context from which this was created (copied)
   *  @type ObjectId */
  parentContext: {
    type: ObjectId,
    index: true
  },
  /** Project which owns this Context
   *  @type ObjectId */
  parentProject: {
    type: ObjectId,
    index: true
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
});

extend(ContextSchema.methods, BaseSchema.methods);
extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.set('toJSON', { virtuals: true });
