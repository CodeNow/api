async = require 'async'
configs = require '../configs'
error = require '../error'
images = require './images'
users = require './users'
mongoose = require 'mongoose'
_ = require 'lodash'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

channelSchema = new Schema
  name:
    type: String
  description:
    type: String
  alias:
    type: [String]
    index: true
    unique: true
  category:
    type: [
        name:
          type:String
          index:
            sparse:true
        alias:
          type: [String]
          index:
            sparse: true
      ]
    default: []

channelSchema.statics.getChannel = (name, cb) ->
  lower = name.toLowerCase()
  @findOne alias:lower, (err, channel) ->
    if err? then throw err else
      if channel then cb null, channel.toJSON() else
        images.listTags (err, tagNames) ->
          if err? then throw err else
            tagFound = _.find tagNames, (name) -> lower is name.toLowerCase()
            if not tagFound? then cb code:404, msg: 'not found' else
              cb null, { _id:tagFound, name:tagFound }

channelSchema.statics.createChannel = (userId, data, cb) ->
  self = this;
  users.findUser _id:userId, (err, user) ->
    if err? then throw err else
      if not user.isModerator then cb code: 403, msg: 'permission denied' else
        name = data.name
        if not name? then cb code: 400, msg: 'name required' else
          channel = new self;
          channel.name = name
          channel.description = data.description
          channel.alias = [name.toLowerCase()]
          category = data.category
          if category? then channel.category = name:category, alias:[category.toLowerCase()]
          channel.save (err) ->
            if err? then throw err else
              cb null, channel.toJSON()

channelSchema.statics.listChannels = (cb) ->
  images.listTags (err, tagNames) =>
    if err? then throw err else
      @findWithNames tagNames, (err, dbChannels) ->
        if err? then throw err else
          channels = tagNames.map (name) ->
            lower = name.toLowerCase()
            dbChannel = _.find dbChannels, (chan) -> ~chan.alias.indexOf(lower)
            return dbChannel or name:name
          cb null, channels

channelSchema.statics.listChannelsInCategory = (category, cb) ->
  lower = category.toLowerCase();
  @find 'category.alias':lower, (err, channels) ->
    if err? then throw err else
      channels = channels.map (channel) -> channel.toJSON()
      cb null, channels

channelSchema.statics.findWithNames = (names, cb) ->
  lowerNames = names.map (name) -> name.toLowerCase()
  @find alias: $in: lowerNames, cb

channelSchema.statics.rename = (userId, channelId, name, cb) ->
  users.findUser _id:userId, (err, user) ->
    if err then throw err else
      if not user.isModerator then res.json 403, msg: 'permission denied' else
        if not name? then res.json 400, msg: 'name required' else
          lower = name.toLowerCase()
          @find _id:channelId, (err, channel) ->
            if err? then throw err else
              oldLower = channel.name.toLowerCase()
              update = $set:{name:name}, $push:{alias:lower}, $pull:{alias:oldLower}
              @findOneAndUpdate _id:channelId, update, (err, channel) ->
                if err? then throw err else
                  cb null, channel.toJSON()

channelSchema.statics.getCategory = (name, cb) ->
  @listCategories (err, categories) ->
    if err then throw err else
      category = _.findWhere categories, name:name
      if (!category) then cb code:404, message:'not found' else
        cb null, category

channelSchema.statics.listCategories = (cb) ->
  @find().distinct 'category.name', (err, categoryNames) ->
    if err? then throw err else
      categories = categoryNames.map (name) -> name:name
      cb null, categories

module.exports = mongoose.model 'Channels', channelSchema