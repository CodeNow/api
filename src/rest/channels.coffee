configs = require '../configs'
express = require 'express'
runnable = require '../models/runnables'

channelApp = module.exports = express()

getchannels = (req, res, next) ->
  runnable.listChannels (err, channels) ->
    if err
      next err
    else
      res.json channels

getchannelrepos = (req, res, next) ->
  runnable.listChannelProjects req.params.channelid, (err, projects) ->
    if err
      next err
    else
      res.json projects

channelApp.get '/channels', getchannels
channelApp.get '/channels/:channelid', getchannelrepos
channelApp.get '/channelRepos', getchannelrepos