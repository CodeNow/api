async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'
users = require './users'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

specificationSchema = new Schema
  owner
    type: ObjectId
  name:
    type:String
    index: true
    unique: true
  description:
    type: String
  instructions:
    type: String
  requirements:
    type: [String]
    default: [ ]

specificationSchema.statics.createSpecification = (domain, opts, cb) ->
specificationSchema.statics.listSpecifications = (domain, cb) ->
specificationSchema.statics.getSpecification = (domain, id, cb) ->
specificationSchema.statics.updateSpecification = (domain, opts, cb) ->
specificationSchema.statics.deleteSpecification = (domain, opts, cb) ->


module.exports = mongoose.model 'Specifications', specificationSchema