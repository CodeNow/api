async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'
users = require './users'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

implimentationSchema = new Schema
  url:
    type:String
    index: true
    unique: true
  requirements:
    type: [
      name: String
      value: String
    ]
    default: [ ]

implimentationSchema.statics.createImplimentation = (domain, opts, cb) ->
implimentationSchema.statics.listImplimentations = (domain, userId, cb) ->
implimentationSchema.statics.getImplimentation = (domain, opts, cb) ->
implimentationSchema.statics.updateImplimentation = (domain, opts, cb) ->
implimentationSchema.statics.deleteImplimentation = (domain, opts, cb) ->

module.exports = mongoose.model 'Implimentation', implimentationSchema