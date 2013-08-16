async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'
users = require './users'
uuid = require 'node-uuid'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

implimentationSchema = new Schema
  owner:
    type: ObjectId
  impliments:
    type: ObjectId
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
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      @find
        owner: opts.userId
        impliments: opts.specificationId
      , domain.intercept (implimentations) =>
        if implimentations.length then cb error 403, 'implimentation already exists' else
          implimentation = new @
          implimentation.owner = opts.userId
          implimentation.impliments = opts.specificationId
          implimentation.url = "#{uuid.v4()}.#{configs.baseDomain}"
          implimentation.requirements = opts.requirements
          implimentation.save domain.intercept () ->
            cb null, implimentation.toJSON()

implimentationSchema.statics.listImplimentations = (domain, userId, cb) ->
  users.findUser domain, _id: userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @find {}, domain.intercept (implimentations) => 
          cb null, implimentations.toJSON()
      else
        @find 
          owner: userId
        , domain.intercept (implimentations) => 
          cb null, implimentations.toJSON()

implimentationSchema.statics.getImplimentation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.implimentationId
        , domain.intercept (implimentation) =>
          cb null, implimentation.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implimentationId
        , domain.intercept (implimentation) =>
          cb null, implimentation.toJSON()

implimentationSchema.statics.updateImplimentation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.implimentationId
        , domain.intercept (implimentation) =>
          implimentation.requirements = opts.requirements
          implimentation.save domain.intercept () ->
            cb null, implimentation.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implimentationId
        , domain.intercept (implimentation) =>
          implimentation.requirements = opts.requirements
          implimentation.save domain.intercept () ->
            cb null, implimentation.toJSON()

implimentationSchema.statics.deleteImplimentation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @remove
          _id: opts.implimentationId
        , domain.intercept cb
      else
        @remove
          owner: opts.userId
          _id: opts.implimentationId
        , domain.intercept cb

module.exports = mongoose.model 'Implimentation', implimentationSchema