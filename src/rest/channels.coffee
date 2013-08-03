configs = require '../configs'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.get '/channels/categories', (req, res) ->
    channels.listCategories (err, categories) ->
      if err then res.json err.code, message: err.msg else
        res.json categories

  app.get '/channels/:name', (req, res) ->
    channels.getChannel req.params.name, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  # app.put '/channels/:name', (req, res) ->
  #   channelName = req.params.name
  #   async.waterfall [
  #     (cb) ->
  #       if not req.body.name? then cb() else
  #         channels.rename req.user_id, channelName, req.body.name, (err, channel) ->
  #           if err then res.json err.code, message: err.msg else
  #             cb null, channel
  #     (file, cb) ->
  #       if not req.body.description? then cb() else
  #         channels.updateDescription
  #     (file, cb) ->

  #     (file, cb) ->

  #   ], (err, file) ->
  #     if err then res.json err.code, message: err.msg else
  #       if not file then res.json 400, message: 'must provide content, name, path or tag to update operation' else
  #         res.json file

  app.get '/channels', (req, res) ->
    if req.query.category?
      channels.listChannelsInCategory req.query.category, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else if req.query.channel?
      channels.listChannelsInChannel req.query.channel, (err, channels) ->
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