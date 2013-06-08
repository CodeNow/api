express = require 'express'
users = require '../models/users'
runnables = require '../models/runnables'

runnableApp = module.exports = express()

runnableApp.post '/runnables', (req, res) ->
  framework = req.query.framework or 'node.js'
  runnables.create req.session.user_id, framework, (err, runnable) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 201, runnable

runnableApp.get '/runnables', (req, res) ->
  if req.query.published
    runnables.listPublished (err, results) ->
      if err then res.json err.code { message: err.msg } else
        res.json results
  else if req.query.channel
    runnables.listChannel req.query.channel, (err, results) ->
      if err then res.json err.code { message: err.msg } else
        res.json results
  else
    runnables.listOwn req.session.user_id, (err, results) ->
      if err then res.json err.code { message: err.msg } else
        res.json results