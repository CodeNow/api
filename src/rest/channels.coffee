configs = require '../configs'
channels = require '../models/channels'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/channels', (req, res) ->
    channels.createChannel req.domain, req.user_id, req.body, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, channel

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

  app.get '/channels/:id', (req, res) ->
    channels.getChannel req.domain, req.params.id, (err, channel) ->
      if err then res.json err.code, message: err.msg else
        res.json channel

  app.del '/channels/:id', (req, res) ->
    channels.deleteChannel req.domain, req.user_id, req.params.id, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'channel deleted' }

  app.get '/channels/:id/tags', (req, res) ->
    channels.listTags req.domain, req.parmas.id, (err, tags) ->
      if err then res.json err.code, message: err.msg else
        res.json tags

  app.post '/channels/:id/tags', (req, res) ->
    channels.addTag req.domain, req.params.id, req.body.name, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json tag

  app.get '/channels/:id/tags/:tagid', (req, res) ->
    channels.getTag req.domain, req.params.id, req.params.tagid, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json tag

  app.del '/channels/:id/tags/:tagid', (req, res) ->
    channels.deleteTag req.domain, req.params.id, req.params.tagid, (err, categories) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'tag deleted' }

  app