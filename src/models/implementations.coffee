async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'
users = require './users'
uuid = require 'node-uuid'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

implementationSchema = new Schema
  owner:
    type: ObjectId
  implements:
    type: ObjectId
  subDomain:
    type:String
    index: true
    unique: true
  requirements:
    type: [
      name: String
      value: String
    ]
    default: [ ]

implementationSchema.statics.createImplementation = (domain, opts, cb) ->
  if not opts.specificationId then cb 400, 'needs specification' else
    users.findUser domain, _id: opts.userId, domain.intercept (user) =>
      if not user then cb error 404, 'user not found' else
        @findOne
          owner: opts.userId
          implements: opts.specificationId
        , domain.intercept (implementation) =>
          if implementation then cb error 403, 'implementation already exists' else
            implementation = new @
            implementation.owner = opts.userId
            implementation.implements = opts.specificationId
            implementation.subDomain = "#{uuid.v4()}"
            implementation.requirements = opts.requirements
            implementation.save domain.intercept () ->
              cb null, implementation.toJSON()

implementationSchema.statics.listImplementations = (domain, userId, cb) ->
  users.findUser domain, _id: userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @find {}, domain.intercept (implementations) => 
          cb null, implementations.map (implementation) -> implementation.toJSON()
      else
        @find 
          owner: userId
        , domain.intercept (implementations) => 
          cb null, implementations.map (implementation) -> implementation.toJSON()

implementationSchema.statics.getImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            cb null, implementation.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            cb null, implementation.toJSON()

implementationSchema.statics.updateImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            implementation.requirements = opts.requirements
            implementation.save domain.intercept () ->
              cb null, implementation.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            implementation.requirements = opts.requirements
            implementation.save domain.intercept () ->
              cb null, implementation.toJSON()

implementationSchema.statics.deleteImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @remove
          _id: opts.implementationId
        , domain.intercept (count) =>
          if count is 0 
            cb error 404, 'implementation not found'
          else
            cb null
      else
        @remove
          owner: opts.userId
          _id: opts.implementationId
        , domain.intercept (count) =>
          if count is 0 
            cb error 404, 'implementation not found'
          else
            cb null

module.exports = mongoose.model 'Implementation', implementationSchema