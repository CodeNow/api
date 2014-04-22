var _ = require('lodash');
var mongoose = require('mongoose');

var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var ProjectSchema = new Schema({
  name: {
    type: String,
    index: { unique: true }
  },
  description: {
    type: String,
    'default': ''
  },
  public: {
    type: Boolean,
    default: false
  },
  owner: {
    type: ObjectId,
    index: true
  },
  parent: {
    type: ObjectId,
    index: true
  },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  contexts: {
    type: [{
      context: {
        type: ObjectId,
        version: String
      }
    }],
    'default': []
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

_.extend(ProjectSchema.methods, BaseSchema.methods);
_.extend(ProjectSchema.statics, BaseSchema.statics);

ProjectSchema.set('toJSON', { virtuals: true });

var Project = module.exports = mongoose.model('Projects', ProjectSchema);
