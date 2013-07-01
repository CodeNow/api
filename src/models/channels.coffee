async = require 'async'
configs = require '../configs'
error = require '../error'
images = require './images'
mongoose = require 'mongoose'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

channelSchema = new Schema
  title:
    type: String
  description:
    type: String
  tag:
    type: String
    index: true
    unique: true

channelSchema.statics.listChannels = (cb) ->
  images.listTags (err, tags) =>
    if err then cb err else
      async.map tags, (tag, cb) =>
        @findOne tag: tag, (err, channel) ->
          if err then cb new error { code: 500, msg: 'error looking up mongodb' } else
            if not channel then cb null, tag else
              cb null, channel
      , cb

module.exports = mongoose.model 'Channels', channelSchema