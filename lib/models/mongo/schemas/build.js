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
var BuildSchema = module.exports = new Schema({
  // the ID of this object will be the docker tag
  /** type: string */
  name: { type: String },
  /** type: ObjectId */
  owner: {
    type: ObjectId,
    ref: 'Users'
  },
  /** type: ObjectId */
  project: {
    type: ObjectId,
    ref: 'Projects'
  },
  /** type: ObjectId */
  environment: ObjectId,
  /** type: ObjectId */
  contexts: [{
    type: ObjectId,
    ref: 'Contexts'
  }],
  /** type: ObjectId */
  versions: [{
    type: ObjectId,
    ref: 'Versions'
  }],
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  /** type: ObjectId */
  createdBy: {
    type: ObjectId,
    ref: 'Users'
  }
});

extend(BuildSchema.methods, BaseSchema.methods);
extend(BuildSchema.statics, BaseSchema.statics);

BuildSchema.set('toJSON', { virtuals: true });