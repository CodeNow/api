async = require 'async'
configs = require '../configs'
mongoose = require 'mongoose'
projects = require './projects'

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
  projects.listTags (err, tags) =>
    if err then cb err else
      async.map tags, (tag, cb) =>
        @findOne tag: tag, (err, channel) ->
          if err then cb { code: 500, msg: 'error looking up mongodb' } else
            if not channel then cb null, tag else
              cb null, channel
      , cb

module.exports = mongoose.model 'Channels', channelSchema