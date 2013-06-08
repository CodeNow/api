configs = require '../configs'
express = require 'express'
runnable = require '../models/runnables'

channelApp = module.exports = express()

getchannelrepos = (req, res) ->
  runnable.listChannelProjects req.params.channelid, (err, projects) ->
    if err then res.json err.code { message: err.msg } else
      res.json projects

channelApp.get '/channels', (req, res) ->
  runnable.listChannels (err, channels) ->
    if err then res.json err.code { message: err.msg } else
      res.json channels

channelApp.get '/channels/:channelid', getchannelrepos
channelApp.get '/zomg', ->
    throw new Error 'zomg'