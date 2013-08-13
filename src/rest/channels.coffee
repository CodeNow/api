configs = require '../configs'
categories = require '../models/categories'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/channels', (req, res) ->
    channels.createChannel req.domain, req.user_id, req.body.name, req.body.description, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, channel

  app.get '/channels', (req, res) ->
    if req.query.category?
      channels.listChannelsInCategory req.domain, categories, req.query.category, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else if req.query.channel?
      channels.listChannelsInChannel req.domain, categories, req.query.channel, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels
    else
      channels.listChannels req.domain, categories, (err, channels) ->
        if err then res.json err.code, message: err.msg else
          res.json channels

  app.get '/channels/:id', (req, res) ->
    channels.getChannel req.domain, categories, req.params.id, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  app.del '/channels/:id', (req, res) ->
    channels.deleteChannel req.domain, req.user_id, req.params.id, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'channel deleted' }

  app.put '/channels/:id/aliases', (req, res) ->
    channels.updateAliases req.domain, req.user_id, req.params.id, req.body, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel.aliases

  app.get '/channels/:id/tags', (req, res) ->
    channels.getTags req.domain, categories, req.params.id, (err, tags) ->
      if err then res.json err.code, message: err.msg else
        res.json tags

  app.post '/channels/:id/tags', (req, res) ->
    channels.addTag req.domain, categories, req.user_id, req.params.id, req.body.name, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, tag

  app.get '/channels/:id/tags/:tagid', (req, res) ->
    channels.getTag req.domain, categories, req.params.id, req.params.tagid, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json tag

  app.del '/channels/:id/tags/:tagid', (req, res) ->
    channels.removeTag req.domain, req.user_id, req.params.id, req.params.tagid, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'tag deleted' }

  app