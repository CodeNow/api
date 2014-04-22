var _ = require('lodash');
var mongoose = require('mongoose');

var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var ContextSchema = new Schema({
  name: {
    type: String,
    index: { unique: true }
  },
  displayName: { type: String },
  description: {
    type: String,
    'default': ''
  },
  dockerfile: { type: String },
  source: [{
    type: String,
    location: String
  }],
  owner: {
    type: ObjectId,
    index: true
  },
  versions: [{
    tag: String,
    created: {
      type: Date,
      'default': Date.now,
      index: true
    }
  }],
  parent: {
    type: ObjectId,
    index: true
  },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  tags: {
    type: [{
      channel: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
  }
});

_.extend(ContextSchema.methods, BaseSchema.methods);
_.extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.set('toJSON', { virtuals: true });

var Context = module.exports = mongoose.model('Contexts', ContextSchema);
