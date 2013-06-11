express = require 'express'
path = require 'path'
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

runnableApp.get '/runnables/:id/comments/:commentId', (req, res) ->
  fetchUser = req.query.user?
  runnables.getComment req.params.id, fetchUser, req.params.commentId, (err, comments) ->
    if err then res.json err.code, { message: err.msg } else
      res.json comments

runnableApp.del '/runnables/:id/comments/:commentId', (req, res) ->
  runnables.removeComment req.session.user_id, req.params.id, req.params.commentId, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, { message: 'comment deleted' }

runnableApp.get '/runnables/:id/tags', (req, res) ->
  runnables.getTags req.params.id, (err, tags) ->
    if err then res.json err.code, { message: err.msg } else
      res.json tags

runnableApp.post '/runnables/:id/tags', (req, res) ->
  if not req.body.name then res.json 400, { message: 'tag must include a name field' } else
    if req.user.permission_level < 1 then res.json 403, { message: 'permission denied' } else
      runnables.addTag req.session.user_id, req.params.id, req.body.name, (err, tag) ->
        if err then res.json err.code, { message: err.msg } else
          res.json 201, tag

runnableApp.get '/runnables/:id/tags/:tagId', (req, res) ->
  runnables.getTag req.params.id, req.params.tagId, (err, tag) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, tag

runnableApp.del '/runnables/:id/tags/:tagId', (req, res) ->
  runnables.removeTag req.session.user_id, req.params.id, req.params.tagId, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, { message: 'tag deleted' }

runnableApp.post '/runnables/:id/files', (req, res) ->
  if req.body.dir
    if not req.body.name then res.json 400, { message: 'dir must include a name field' } else
      if not req.body.path then res.json 400, { message: 'dir must include a path field' } else
        runnables.createDirectory req.session.user_id, req.params.id, req.body.name, req.body.path, (err, dir) ->
          if err then res.json err.code, { message: err.msg } else
            res.json 201, dir
  else
    if not req.body.name then res.json 400, { message: 'file must include a name field' } else
      if not req.body.content then res.json 400, { message: 'file must include a content field' } else
        if not req.body.path then res.json 400, { message: 'file must include a path field' } else
          runnables.createFile req.session.user_id, req.params.id, req.body.name, req.body.path, req.body.content, (err, file) ->
            if err then res.json err.code, { message: err.msg } else
              res.json 201, file

runnableApp.get '/runnables/:id/files/:fileid', (req, res) ->
  runnables.readFile req.params.id, req.params.fileid, (err, file) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, file