'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var BaseSchema = require('models/mongo/schemas/base');
var assign = require('101/assign');

/** @alias module:models/user-whitelist */
var TemplateSchema = module.exports = new Schema({
  /** @type: string */
  name: {
    type: String,
    required: 'template requires name'
  },
  /** @type: string */
  lowerName: {
    type: String,
    required: 'template requires lowerName',
    index: {
      unique: true
    }
  },
  /** @type: string */
  from: {
    type: String,
    required: 'template requires from'
  },
  /** @type: string */
  defaultTag: String,
  /** @type: Object */
  // mixed because it is another object
  env: {},
  /** @type: Array<String> */
  templateEnv: {
    type: [String],
    'default': []
  },
  /** @type: Array<Number> */
  ports: {
    type: [Number],
    'default': []
  },
  /** @type: Array<String> */
  generalCommands: {
    type: [String],
    'default': []
  },
  /** @type: Array<String> */
  defaultMainCommands: {
    type: [String],
    'default': []
  },
  /** @type: String */
  defaultWorkDir: String,
  /** @type: String */
  cmd: String,
  /** @type: String */
  entryPoint: String,
  /** @type: Boolean */
  deleted: Boolean,

  // niceties
  /** @type: Date */
  created: {
    type: Date,
    'default': Date.now
  },
  /** @type: Date */
  updated: Date
});

// sets `lowerName` when we set `name`
TemplateSchema.path('name').set(function(name) {
  this.lowerName = name.toLowerCase();
  return name;
});

TemplateSchema.pre('save', function(next) {
  this.updated = Date.now();
  next();
});

assign(TemplateSchema.methods, BaseSchema.methods);
assign(TemplateSchema.statics, BaseSchema.statics);

