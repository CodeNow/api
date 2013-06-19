configs = require '../configs'
channels = require '../models/channels'
express = require 'express'

channelApp = module.exports = express()

channelApp.get '/channels/:tag', (req, res, next) ->
  next { code: 400, msg: 'not implemented' }

channelApp.get '/channels', (req, res, next) ->
  channels.listChannels (err, channels) ->
    if err then next err else
      res.json channels