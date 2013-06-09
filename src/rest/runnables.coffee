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

runnableApp.get '/runnables/:id', (req, res) ->
  fetchComments = req.query.comments?
  runnables.get req.params.id, fetchComments, (err, runnable) ->
    if err then res.json err.code, { message: err.msg } else
      res.json runnable

runnableApp.del '/runnables/:id', (req, res) ->
  runnables.delete req.session.user_id, req.params.id, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json { message: 'runnable deleted' }

runnableApp.get '/runnables/:id/comments', (req, res) ->
  fetchUsers = req.query.users?
  runnables.getComments req.params.id, fetchUsers, (err, comments) ->
    if err then res.json err.code, { message: err.msg } else
      res.json comments

runnableApp.post '/runnables/:id/comments', (req, res) ->
  if not req.body.text then res.json 400, { message: 'comment must include a text field' } else
    if req.user.permission_level < 1 then res.json 403, { message: 'permission denied' } else
      runnables.addComment req.session.user_id, req.params.id, req.body.text, (err, comment) ->
        if err then res.json err.code, { message: err.msg } else
          res.json 201, comment

runnableApp.del '/runnables/:id/comments/:commentId', (req, res) ->
  runnables.removeComment req.session.user_id, req.params.id, req.params.commentId, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, { message: 'comment deleted' }