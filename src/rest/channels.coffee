configs = require '../configs'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.get '/channels/categories', (req, res) ->
    channels.listCategories req.domain, (err, categories) ->
      if err then res.json err.code, message: err.msg else
        res.json categories

  app.get '/channels/:name', (req, res) ->
    channels.getChannel req.domain, req.params.name, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  app.get '/channels', (req, res) ->
    if req.query.category?
      channels.listChannelsInCategory req.domain, req.query.category, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else if req.query.channel?
      channels.listChannelsInChannel req.domain, req.query.channel, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else
      channels.listChannels req.domain, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels

  app.post '/channels', (req, res) ->
    channels.createChannel req.domain, req.user_id, req.body, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, channel

  app