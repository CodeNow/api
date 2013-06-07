configs = require '../configs'
express = require 'express'
Runnable = require '../models/runnable'

channelApp = module.exports = express()

channelApp.use (req, res, next) ->
  req.runnable = new Runnable req.session.user_id
  next()

getchannels = (req, res) ->
  req.runnable.listChannels (err, channels) ->
    if err
      next err
    else
      res.json channels

getchannelrepos = (req, res) ->
  req.runnable.listChannelProjects req.params.channelid, (err, projects) ->
    if err
      next err
    else
      res.json projects

channelApp.get '/channels', getchannels
channelApp.get '/channels/:channelid', getchannelrepos
channelApp.get '/channelRepos', getchannelrepos