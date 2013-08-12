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
    index: true
    unique: true
  description:
    type: String
  aliases:
    type: [ String ]
    index: true
    unique: true
    default: [ ]
  tags:
    type: [
      category: ObjectId
    ]
    default: [ ]

channelSchema.statics.getChannel = (domain, categories, id, cb) ->
  @findOne _id: id, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      channel.tags = channel.tags or [ ]
      async.forEach channel.tags, (tag, cb) ->
        categories.findOne _id: tag.category, domain.intercept (category) ->
          tag.name = category.name
          cb()
      , (err) ->
        if err then cb err else
          cb null, channel

channelSchema.statics.createChannel = (domain, userId, name, desc, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if not user.isModerator then cb error 403, 'permission denied' else
          if not name? then cb error 400, 'name required' else
            channel = new @
            channel.name = name
            if desc then channel.description = desc
            channel.aliases = [ name.toLowerCase() ]
            if name isnt name.toLowerCase() then channel.aliases.push name
            channel.save domain.intercept () ->
              cb null, channel.toJSON()

channelSchema.statics.createImplicitChannel = (domain, name, cb) ->
  channel = new @
  channel.name = name
  channel.aliases = [name.toLowerCase()]
  if name isnt name.toLowerCase() then channel.aliases.push name
  channel.save domain.intercept () ->
    cb null, channel.toJSON()

channelSchema.statics.listChannels = (domain, categories, cb) ->
  @find { }, domain.intercept (channels) ->
    async.map channels, (channel, cb) ->
      images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
        channel.count = count
        channel.tags = channel.tags or [ ]
        async.forEach channel.tags, (tag, cb) ->
          categories.findOne _id: tag.category, domain.intercept (category) ->
            tag.name = category.name
            cb()
        , (err) ->
          if err then cb err else
            cb null, channel
    , cb

channelSchema.statics.listChannelsInCategory = (domain, categories, categoryName, cb) ->
  @find 'category.aliases':categoryName, domain.intercept (channels) ->
    channels = channels.map (channel) -> channel.toJSON()
    async.map channels, (channel, mcb) ->
      images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
        channel.count = count
        channel.tags = channel.tags or [ ]
        async.forEach channel.tags, (tag, cb) ->
          categories.findOne _id: tag.category, domain.intercept (category) ->
            tag.name = category.name
            cb()
        , (err) ->
          if err then cb err else
            cb null, channel
    , cb

channelSchema.statics.updateChannel = (domain, userId, channelId, newName, cb) ->
  users.findUser domain, _id:userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        if not newName? then cb error 400, 'name required' else
          @findOne _id: channelId, domain.intercept (channel) ->
            channel.name = newName
            channel.aliases = [ newName.toLowerCase() ]
            if newName isnt newName.toLowerCase() then channel.aliases.push newName
            channel.save domain.intercept () ->
              cb null, channel.toJSON()

channelSchema.statics.updateAliases = (domain, userId, channelId, newAliases, cb) ->
  users.findUser domain, _id:userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if not user.isModerator then cb error 403, 'permission denied' else
          if not newAliases? then cb error 400, 'new aliases required' else
            @findOne _id: channelId, domain.intercept (channel) ->
              channel.aliases = newAliases
              channel.save domain.intercept () ->
                cb null, channel.toJSON()

channelSchema.statics.deleteChannel = (domain, userId, channelId, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user.isModerator then cb error 403, 'permission denied' else
        @remove _id: channelId, domain.intercept () ->
          cb()

channelSchema.statics.getTags = (domain, channelId, cb) ->
  @findOne _id: channelId, domain.intercept (channel) ->
    if not image then cb error 404, 'channel not found' else
      cb null, channel.tags

channelSchema.statics.getTag = (domain, channelId, tagId, cb) ->
  @findOne _id: channelId, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      tag = channel.tags.id tagId
      if not tag then cb error 404, 'tag not found' else
        cb null, tag

channelSchema.statics.addTag = (domain, categories, userId, channelId, text, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if user.permission_level < 5 then cb error 403, 'permission denied' else
          @findOne _id: channelId, domain.intercept (channel) ->
            if not channel then cb error 404, 'channel not found' else
              categories.findOne { aliases : text }, domain.intercept (category) ->
                if category
                  channel.tags.push category: category._id
                  tagId = channel.tags[channel.tags.length-1]._id
                  channel.save domain.intercept () ->
                    cb null, { name: category.name, _id: tagId }
                else
                  categories.createImplicitCategory domain, text, (err, category) ->
                    if err then cb err else
                      channel.tags.push category: category._id
                      tagId = channel.tags[channel.tags.length-1]._id
                      channel.save domain.intercept () ->
                        cb null, { name: category.name, _id: tagId }

channelSchema.statics.removeTag = (domain, userId, channelId, tagId, cb) ->
  @findOne _id: runnableId, domain.intercept (channel) ->
    if not channel then cb error 404, 'runnable not found' else
      users.findOne _id: userId, domain.intercept (user) ->
        if not user then cb error 403, 'user not found' else
          if user.permission_level < 5 then cb error 403, 'permission denied' else
            channel.tags.id(tagId).remove()
            channel.save domain.intercept () ->
              cb()

module.exports = mongoose.model 'Channels', channelSchema