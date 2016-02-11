'use strict'

var mongoose = require('mongoose')
var BaseSchema = require('models/mongo/schemas/base')
var Schema = mongoose.Schema
var extend = require('extend')

var KeypairSchema = module.exports = new Schema({
  publicKey: {
    type: String,
    required: true
  },
  privateKey: {
    type: String,
    required: true
  }
})

extend(KeypairSchema.methods, BaseSchema.methods)
extend(KeypairSchema.statics, BaseSchema.statics)
extend(KeypairSchema.owner, BaseSchema.owner)
