async = require 'async'
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

categorySchema.statics.getCategory = (domain, name, cb) ->
  @listCategories domain, (categories) ->
    category = _.findWhere categories, name:name
    if (!category) then cb error 404, 'not found' else
      cb null, category

categorySchema.statics.listCategories = (domain, cb) ->
  channels = this;
  @find().distinct 'category.name', domain.intercept (categoryNames) ->
    async.map categoryNames, (name, mcb) ->
      category = name:name
      channels.listChannelsInCategory domain, name, (err, channels) ->
        if err then mcb err else
          countImagesInChannels domain, channels, (count) ->
            category.count = count
            mcb null, category
    , cb

module.exports = mongoose.model 'Categories', categorySchema