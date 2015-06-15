'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var BaseSchema = require('models/mongo/schemas/base');
var assign = require('101/assign');

/** @alias module:models/user-whitelist */
var TemplateSchema = module.exports = new Schema({
  /** @type: string */
  from: {
    type: String,
    required: 'template requires from'
  },
  /** @type: string */
  lowerFrom: {
    type: String,
    required: 'template requires lowerFrom',
    index: { unique: true }
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
  /** @type: String */
  cmd: String,
  /** @type: String */
  entryPoint: String,

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
TemplateSchema.path('from').set(function (from) {
  this.lowerFrom = from.toLowerCase();
  return from;
});

TemplateSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

assign(TemplateSchema.methods, BaseSchema.methods);
assign(TemplateSchema.statics, BaseSchema.statics);

