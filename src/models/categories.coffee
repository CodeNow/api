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
    index:
      sparse:true
  description:
    type: String
  alias:
    type: [String]
    index:
      sparse: true

categorySchema.statics.getCategory = (domain, categoryId, cb) ->
  @find { _id: categoryId }, domain.intercept (category) ->
    if not category then cb error 404, 'not found' else
      cb null, category

categorySchema.statics.listCategories = (domain, cb) ->
  @find { }, domain.intercept (categories) ->
    async.map categories, (category, cb) ->
      channels.find('tags.category': category._id).count().exec domain.intercept (count) ->
        category.count = count
        cb null, category
    , cb

categorySchema.statics.createCategory = (domain, userId, name, desc, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        if not name? then cb error 400, 'name required' else
          category = new @
          category.name = name
          if desc then category.description = desc
          category.alias = [name.toLowerCase()]
          if name isnt name.toLowerCase() then category.alias.push name
          category.save domain.intercept () ->
            cb null, category.toJSON()

categorySchema.statics.updateCategory = (domain, categoryId, newName, cb) ->
  users.findUser domain, _id: userId, (err, user) ->
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        if not newName? then cb error 400, 'name required' else
          @findOne _id: categoryId, domain.intercept (category) ->
            category.name = newName
            category.alias = [ newName.toLowerCase() ]
            if newName isnt newName.toLowerCase() then category.alias.push newName
            category.save domain.intercept () ->
              cb null, category.toJSON()

categorySchema.statics.deleteCategory = (domain, categoryId, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        @remove _id: categoryId, domain.intercept () ->
          cb()

module.exports = mongoose.model 'Categories', categorySchema