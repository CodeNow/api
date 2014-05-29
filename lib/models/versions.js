'use strict';

var extend = require('lodash').extend;

var mongoose = require('mongoose');
var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/version */
var VersionSchema = new Schema({
  // the ID of this object will be the docker tag
  name: { type: String },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  context: ObjectId,
  dockerfile: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }]
  },
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Versions', VersionSchema);
