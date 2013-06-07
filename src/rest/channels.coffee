configs = require '../configs'
express = require 'express'
runnable = require '../models/runnables'

channelApp = module.exports = express()

getchannels = (req, res) ->
  runnable.listChannels (err, channels) ->
    if err then res.json err.code { message: err.msg } else
      res.json channels

getchannelrepos = (req, res) ->
  runnable.listChannelProjects req.params.channelid, (err, projects) ->
    if err then res.json err.code { message: err.msg } else
      res.json projects

channelApp.get '/channels', getchannels
channelApp.get '/channels/:channelid', getchannelrepos
channelApp.get '/channelRepos', getchannelrepos