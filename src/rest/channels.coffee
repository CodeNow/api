configs = require '../configs'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.get '/channels/:name', (req, res) ->
    channels.getChannel req.params.name, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  app.get '/channels', (req, res) ->
    if req.query.category?
      channels.listChannelsInCategory req.query.category, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else
      channels.listChannels (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels

  app.post '/channels', (req, res) ->
    channels.createChannel req.user_id, req.body, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, channel

  app.put '/channels/:channelId', (req, res) ->
    channels.rename req.user_id, channelId, req.body.name, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  app.get '/channels/categories', (req, res) ->
    channels.listCategories (err, categories) ->
      if err then res.json err.code, message: err.msg else
        res.json categories

  # app.get '/channels/categories/:name', (req, res) ->
  #   channels.getCategory (err, category) ->
  #     if err then res.json err.code, message: err.msg else
  #       res.json category
