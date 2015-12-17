'use strict'

var BaseSchema = require('models/mongo/schemas/base')
var mongoose = require('mongoose')
var extend = require('extend')
var schemaValidators = require('models/mongo/schemas/schema-validators')

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema
var validators = schemaValidators.commonValidators

var DebugContainerSchema = module.exports = new Schema({
  /** Instance this container is debugging
   *  @type ObjectId */
  instance: {
    type: ObjectId,
    index: true,
    ref: 'Instances',
    required: 'Debug Containers must have an Instance',
    validate: validators.objectId({
      model: 'Debug Container',
      literal: 'Instance'
    })
  },
  /** Since an Instance's context version can change, let's record it here
   * @type ObjectId */
  contextVersion: {
    type: ObjectId,
    index: true,
    ref: 'ContextVersions',
    required: 'Debug Containers must have a Context Version',
    validate: validators.objectId({
      model: 'Debug Container',
      literal: 'Context Version'
    })
  },
  /** @type Object */
  owner: {
    required: 'Debug Containers require an owner',
    type: {
      github: {
        type: Number,
        index: true
      },
      username: String, // dynamic field for filling in
      gravatar: String
    }
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({
      model: 'Debug Container',
      literal: 'Created'
    })
  },
  layerId: {
    type: String,
    required: 'Debug Containers require a layer ID'
  },
  cmd: {
    type: String,
    required: 'Debug Containers require a cmd'
  },
  inspect: Schema.Types.Mixed
})

extend(DebugContainerSchema.methods, BaseSchema.methods)
extend(DebugContainerSchema.statics, BaseSchema.statics)
