'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var debug = require('debug')('runnableApi:version:model');
var extend = require('lodash').extend;
var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');
var join = require('path').join;
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
  /** type: Array.object */
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
  },
  /** Dock box this context lives on
   * @type string */
  dockerHost: {
    type: String
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

VersionSchema.virtual('dockerfile').get(function () {
  var dockerfileKey = join(this.context.toString(), 'source', 'Dockerfile');
  var index = findIndex(this.files, hasProperties({ Key: dockerfileKey }));
  debug('dockerfile index', dockerfileKey, index);
  if (index === -1) { return null; }
  else { return this.files[index]; }
});
