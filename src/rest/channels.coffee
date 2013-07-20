configs = require '../configs'
channels = require '../models/channels'
error = require '../error'
express = require 'express'

app = module.exports = express()

app.get '/channels/:tag', (req, res) ->
  res.json 400, { message: 'not implemented' }

app.get '/channels', (req, res) ->
  channels.listChannels (err, channels) ->
    if err then res.json err.code, message: err.msg else
      res.json channels