configs = require '../configs'
channels = require '../models/channels'
express = require 'express'

channelApp = module.exports = express()

channelApp.get '/channels/:tag', (req, res) ->
  # return information about a specific channel
  res.json 400, { message: 'not implemented' }

channelApp.get '/channels', (req, res) ->
  channels.listChannels (err, channels) ->
    if err then res.json err.code { message: err.msg } else
      res.json channels