'use strict'

var mongoose = require('mongoose')
var Schema = mongoose.Schema
var BaseSchema = require('models/mongo/schemas/base')
var assign = require('101/assign')

/** @alias module:models/user-whitelist */
var UserWhitelistSchema = module.exports = new Schema({
  /** @type: string */
  name: {
    type: String,
    required: 'whitelist requires a name'
  },
  /** @type: string */
  lowerName: {
    type: String,
    required: 'whitelist requires lowerName',
    index: { unique: true }
  },
  githubId: {
    type: Number,
    required: 'Whitelist requires githubId'
  },
  /** @type: boolean */
  allowed: {
    type: Boolean,
    'default': false
  }
})

// sets `lowerName` when we set `name`
UserWhitelistSchema.path('name').set(function (name) {
  this.lowerName = name.toLowerCase()
  return name
})

UserWhitelistSchema.index({ lowerName: 1, allowed: 1 })

assign(UserWhitelistSchema.methods, BaseSchema.methods)
assign(UserWhitelistSchema.statics, BaseSchema.statics)
