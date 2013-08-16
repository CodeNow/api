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
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      @findOne
        name: opts.name
      , domain.intercept (specification) =>
        if specification.length then cb error 403, 'specification already exists' else
          specification = new @
          specification.owner = opts.userId
          specification.name = opts.name
          specification.description = opts.description
          specification.instructions = opts.instructions
          specification.requirements = opts.requirements
          specification.save domain.intercept () ->
            cb null, specification.toJSON()

specificationSchema.statics.listSpecifications = (domain, cb) ->
  @find {}, domain.intercept (specifications) => 
    cb null, specifications.toJSON()

specificationSchema.statics.getSpecification = (domain, id, cb) ->
  @findOne
    _id: id
  , domain.intercept (specification) =>
    cb null, specification.toJSON()

specificationSchema.statics.updateSpecification = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.specificationId
        , domain.intercept (specification) =>
          specification.description = opts.description
          specification.instructions = opts.instructions
          specification.requirements = opts.requirements
          specification.save domain.intercept () ->
            cb null, specification.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implimentationId
        , domain.intercept (specification) =>
          specification.description = opts.description
          specification.instructions = opts.instructions
          specification.requirements = opts.requirements
          specification.save domain.intercept () ->
            cb null, specification.toJSON()

specificationSchema.statics.deleteSpecification = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @remove
          _id: opts.specificationId
        , domain.intercept cb
      else
        @remove
          owner: opts.userId
          _id: opts.specificationId
        , domain.intercept cb


module.exports = mongoose.model 'Specifications', specificationSchema