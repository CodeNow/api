async = require 'async'
channels = require './channels'
configs = require '../configs'
error = require '../error'
images = require './images'
users = require './users'
mongoose = require 'mongoose'
_ = require 'lodash'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

categorySchema = new Schema
  name:
    type:String
    index: true
    unique: true
  description:
    type: String
  aliases:
    type: [String]
    index: true
    unique: true
    default: [ ]

categorySchema.statics.getCategory = (domain, categoryId, cb) ->
  @findOne _id: categoryId , domain.intercept (category) ->
    if not category then cb error 404, 'not found' else
      channels.find('tags.category': category._id).count().exec domain.intercept (count) ->
        json = category.toJSON()
        json.count = count
        cb null, json

categorySchema.statics.getCategoryByName = (domain, categoryName, cb) ->
  @findOne aliases: categoryName, domain.intercept (category) ->
    if not category then cb error 404, 'not found' else
      channels.find('tags.category': category._id).count().exec domain.intercept (count) ->
        json = category.toJSON()
        json.count = count
        cb null, json

categorySchema.statics.listCategories = (domain, cb) ->
  @find { }, domain.intercept (categories) ->
    async.map categories, (category, cb) ->
      channels.find('tags.category': category._id).count().exec domain.intercept (count) ->
        json = category.toJSON()
        json.count = count
        cb null, json
    , cb

categorySchema.statics.createCategory = (domain, userId, name, desc, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if not user.isModerator then cb error 403, 'permission denied' else
          if not name? then cb error 400, 'name required' else
            @findOne aliases: name, domain.intercept (existing) =>
              if existing then cb error 403, 'category by that name already exists' else
                category = new @
                category.name = name
                if desc then category.description = desc
                category.aliases = [name.toLowerCase()]
                if name isnt name.toLowerCase() then category.aliases.push name
                category.save domain.intercept () ->
                  cb null, category.toJSON()

categorySchema.statics.createImplicitCategory = (domain, name, cb) ->
  category = new @
  category.name = name
  category.aliases = [name.toLowerCase()]
  if name isnt name.toLowerCase() then category.aliases.push name
  category.save domain.intercept () ->
    cb null, category.toJSON()

categorySchema.statics.updateCategory = (domain, userId, categoryId, newName, newDesc, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if not user.isModerator then cb error 403, 'permission denied' else
          if (not newName?) or (not newDesc?) then cb error 400, 'name and desc field required' else
            @findOne _id: categoryId, domain.intercept (category) ->
              if newDesc then category.description = newDesc
              if category.name isnt newName
                category.name = newName
                if not newName in category.aliases
                  category.alias.push newName
              category.save domain.intercept () ->
                cb null, category.toJSON()

categorySchema.statics.updateAliases = (domain, userId, categoryId, newAliases, cb) ->
  users.findUser domain, _id:userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        if not newAliases? then cb error 400, 'aliases required' else
          @findOne _id: categoryId, domain.intercept (channel) ->
            channel.aliases = newAliases
            channel.save domain.intercept () ->
              cb null, channel.toJSON()

categorySchema.statics.deleteCategory = (domain, userId, categoryId, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        @remove _id: categoryId, domain.intercept () ->
          cb()

module.exports = mongoose.model 'Categories', categorySchema