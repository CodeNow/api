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

channelSchema.statics.getChannel = (domain, name, cb) ->
  lower = name.toLowerCase()
  @findOne alias:lower, domain.intercept (channel) ->
    if channel then cb null, channel.toJSON() else
      images.listTags domain, (err, tagNames) ->
        if err then cb err else
          tagFound = _.find tagNames, (name) -> lower is name.toLowerCase()
          if not tagFound? then cb error 404, 'not found' else
            cb null, { _id:tagFound, name:tagFound }

channelSchema.statics.createChannel = (domain, userId, data, cb) ->
  users.findUser domain, _id:userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        name = if typeof data.name is 'string' then data.name else null
        if not name? then cb error 400, 'name required' else
          channel = new @
          channel.name = name
          channel.description = data.description
          channel.alias = [name.toLowerCase()]
          category = data.category
          if category? then channel.category = name:category, alias:[category.toLowerCase()]
          channel.save domain.intercept () ->
            cb null, channel.toJSON()

channelSchema.statics.listChannels = (domain, cb) ->
  images.listTags domain, (err, tagNames) =>
    if err then cb err else
      @findWithNames domain, tagNames, (dbChannels) ->
        async.map tagNames, (name, mcb) ->
          lower = name.toLowerCase()
          dbChannel = _.find dbChannels, (chan) -> ~chan.alias.indexOf(lower)
          channel = dbChannel or name:name
          addCountToChannel domain, channel, mcb
        , cb

channelSchema.statics.listChannelsInChannel = (domain, channelNames, cb) ->
  if not Array.isArray(channelNames) then channels = [channels]
  images.listTagsWithTags domain, channelNames, (err, tagNames) =>
    if err then cb err else
      @findWithNames domain, tagNames, (dbChannels) ->
        async.map tagNames, (name, mcb) ->
          lower = name.toLowerCase()
          dbChannel = _.find dbChannels, (chan) -> ~chan.alias.indexOf(lower)
          channel = dbChannel or name:name
          addCountToChannel domain, channel, mcb
        , cb

channelSchema.statics.listChannelsInCategory = (domain, categoryName, cb) ->
  lower = categoryName.toLowerCase();
  @find 'category.alias':lower, domain.intercept (channels) ->
    channels = channels.map (channel) -> channel.toJSON()
    async.map channels, (channel, mcb) ->
      addCountToChannel domain, channel, mcb
    , cb

channelSchema.statics.findWithNames = (domain, names, cb) ->
  lowerNames = names.map (name) -> name.toLowerCase()
  @find alias: $in: lowerNames, domain.intercept () ->
    cb()

channelSchema.statics.rename = (domain, userId, channelId, name, cb) ->
  users.findUser domain, _id:userId, (err, user) ->
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        if not name? then cb error 400, 'name required' else
          lower = name.toLowerCase()
          @find _id:channelId, domain.intercept (channel) ->
            oldLower = channel.name.toLowerCase()
            update = $set:{name:name}, $push:{alias:lower}, $pull:{alias:oldLower}
            @findOneAndUpdate _id:channelId, update, domain.intercept (channel) ->
              cb null, channel.toJSON()

channelSchema.statics.getCategory = (domain, name, cb) ->
  @listCategories domain, (categories) ->
    category = _.findWhere categories, name:name
    if (!category) then cb error 404, 'not found' else
      cb null, category

channelSchema.statics.listCategories = (domain, cb) ->
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

addCountToChannel = (domain, channel, cb) ->
  alias = channel.alias || [channel.name.toLowerCase()];
  images.find('tags.name':$in:alias).count().exec domain.intercept (count) ->
    channel.count = count
    cb null, channel

countImagesInChannels = (domain, channels, cb) ->
  tags = [];
  channels.forEach (channel) ->
    tags.push(channel.name);
    if channel.alias then tags.concat(channel.alias)
  images.find('tags.name':$in:tags).count().exec domain.intercept () ->
    cb()

module.exports = mongoose.model 'Channels', channelSchema