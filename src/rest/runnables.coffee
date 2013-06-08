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
  runnables.list req.session.user_id, req.query, (err, runnables) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, runnables