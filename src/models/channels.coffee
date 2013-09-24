async = require 'async'
configs = require '../configs'
error = require '../error'
images = require './images'
users = require './users'
mongoose = require 'mongoose'
redis = require 'redis'
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

channelSchema.set 'autoIndex', false

redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress)

channelSchema.statics.getChannel = (domain, categories, id, cb) ->
  @findOne _id: id, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      json = channel.toJSON()
      json.tags = json.tags or [ ]
      images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
        json.count = count
        async.forEach json.tags, (tag, cb) ->
          categories.findOne _id: tag.category, domain.intercept (category) ->
            if category then tag.name = category.name
            cb()
        , (err) ->
          if err then cb err else
            cb null, json

channelSchema.statics.getChannelByName = (domain, categories, name, cb) ->
  lower = name.toLowerCase()
  @findOne aliases:lower, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
        json = channel.toJSON()
        json.count = count
        async.forEach json.tags, (tag, cb) ->
          categories.findOne _id: tag.category, domain.intercept (category) ->
            if category then tag.name = category.name
            cb()
        , (err) ->
          cb err, json

channelSchema.statics.getChannelsWithNames = (domain, categories, names, cb) ->
  if not Array.isArray names then names = [names]
  lowers = names.map (name) -> name.toLowerCase()
  @find aliases:$in:lowers, domain.intercept (channels) ->
    async.map channels, (channel, cb) ->
      images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
        json = channel.toJSON()
        json.count = count
        async.forEach json.tags, (tag, cb) ->
          categories.findOne _id: tag.category, domain.intercept (category) ->
            if category then tag.name = category.name
            cb()
        , (err) ->
          cb err, json
    , cb

channelSchema.statics.createChannel = (domain, userId, name, desc, cb) ->
  users.findUser domain, _id: userId, (err, user) =>
    if err then cb err else
      if not user then cb error 403, 'user not found' else
        if not user.isModerator then cb error 403, 'permission denied' else
          if not name? then cb error 400, 'name required' else
            @findOne aliases: name.toLowerCase(), domain.intercept (existing) =>
              if existing then cb error 403, 'a channel by that name already exists' else
                channel = new @
                channel.name = name
                if desc then channel.description = desc
                channel.aliases = [ name.toLowerCase() ]
                if name isnt name.toLowerCase() then channel.aliases.push name
                channel.save domain.intercept () ->
                  json = channel.toJSON()
                  json.count = 0
                  cb null, json

channelSchema.statics.createImplicitChannel = (domain, name, cb) ->
  channel = new @
  channel.name = name
  channel.aliases = [name.toLowerCase()]
  if name isnt name.toLowerCase() then channel.aliases.push name
  channel.save domain.intercept () ->
    cb null, channel.toJSON()

channelSchema.statics.listChannels = (domain, categories, cb) ->
  redis_client.get 'listChannelsCache', domain.intercept (listChannelsCache) =>
    if listChannelsCache then cb null, JSON.parse(listChannelsCache) else
      @find { }, domain.intercept (channels) ->
        async.map channels, (channel, cb) ->
          images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
            json = channel.toJSON()
            json.count = count
            json.tags = json.tags or [ ]
            async.forEach json.tags, (tag, cb) ->
              categories.findOne _id: tag.category, domain.intercept (category) ->
                if category then tag.name = category.name
                cb()
            , (err) ->
              if err then cb err else
                cb null, json
        , (err, result) ->
          if err then cb err else
            redis_client.setex 'listChannelsCache', 5, JSON.stringify(result)
            cb null, result

channelSchema.statics.listChannelsInCategory = (domain, categories, categoryName, cb) ->
  categories.findOne aliases: categoryName.toLowerCase(), domain.intercept (category) =>
    if not category then cb error 404, 'could not find category' else
      redis_client.get "listChannelsInCategory:#{category}", domain.intercept (listChannelsInCategoryCache) =>
        if listChannelsInCategoryCache then cb null, JSON.parse(listChannelsInCategoryCache) else
          @find 'tags.category' : category._id, domain.intercept (channels) ->
            async.map channels, (channel, cb) ->
              images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
                json = channel.toJSON()
                json.count = count
                json.tags = json.tags or [ ]
                async.forEach json.tags, (tag, cb) ->
                  categories.findOne _id: tag.category, domain.intercept (category) ->
                    if category then tag.name = category.name
                    cb()
                , (err) ->
                  if err then cb err else
                    cb null, json
            , (err, result) ->
              if err then cb err else
                redis_client.set "listChannelsInCategory#{category}", 5, JSON.stringify(result)
                cb null, result

channelSchema.statics.relatedChannels = (domain, channelNames, cb) ->
  lowerNames = channelNames.map (name) -> name.toLowerCase()
  @find aliases:$in:lowerNames, domain.bind (err, channels) =>
    if err then throw err else
      channelIds = channels.map (channel) -> channel._id
      images.relatedChannelIds domain, channelIds, domain.intercept (relatedChannelIds) =>
        relatedChannelIds = toStringDifference relatedChannelIds, channelIds
        @find _id:$in:relatedChannelIds, domain.intercept (channels) ->
          async.map channels, (channel, cb) ->
            images.find('tags.channel': channel._id).count().exec domain.intercept (count) ->
              json = channel.toJSON()
              json.count = count
              cb null, json
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

channelSchema.statics.getTags = (domain, categories, channelId, cb) ->
  @findOne _id: channelId, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      async.map channel.tags, (tag, cb) ->
        json = tag.toJSON()
        categories.findOne _id: json.category, domain.intercept (category) ->
          if category then json.name = category.name
          cb null, json
      , cb

channelSchema.statics.getTag = (domain, categories, channelId, tagId, cb) ->
  @findOne _id: channelId, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      tag = channel.tags.id tagId
      if not tag then cb error 404, 'tag not found' else
        json = tag.toJSON()
        categories.findOne _id: json.category, domain.intercept (category) ->
          if category then json.name = category.name
          cb null, json

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
  @findOne _id: channelId, domain.intercept (channel) ->
    if not channel then cb error 404, 'channel not found' else
      users.findOne _id: userId, domain.intercept (user) ->
        if not user then cb error 403, 'user not found' else
          if user.permission_level < 5 then cb error 403, 'permission denied' else
            channel.tags.id(tagId).remove()
            channel.save domain.intercept () ->
              cb()

toStringDifference = (arr1, arr2) ->
  strArr1 = arr1.map (i) -> i.toString()
  strArr2 = arr2.map (i) -> i.toString()
  filtered1 = arr1.filter (i) -> strArr2.indexOf(i.toString()) is -1
  filtered2 = arr2.filter (i) -> strArr1.indexOf(i.toString()) is -1
  filtered1.concat filtered2

module.exports = mongoose.model 'Channels', channelSchema