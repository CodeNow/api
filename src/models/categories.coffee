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

categorySchema.statics.getCategory = (domain, id, cb) ->
  @find { _id: id }, domain.intercept (category) ->
    if not category then cb error 404, 'not found' else
      cb null, category

categorySchema.statics.listCategories = (domain, cb) ->
  @find { }, domain.intercept (categories) ->
    async.map categories, (category, cb) ->
      channels.find('tags.category': category._id).count().exec domain.intercept (count) ->
        category.count = count
        cb null, category
    , cb

module.exports = mongoose.model 'Categories', categorySchema