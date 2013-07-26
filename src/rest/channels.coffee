configs = require '../configs'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.get '/channels/:tag', (req, res) ->
    res.json 400, { message: 'not implemented' }

  app.get '/channels', (req, res) ->
    channels.listChannels (err, channels) ->
      if err then res.json err.code, message: err.msg else
        res.json channels

  app