express = require 'express'
path = require 'path'
users = require '../models/users'
runnables = require '../models/runnables'

runnableApp = module.exports = express()

runnableApp.post '/runnables', (req, res) ->
  if req.body.parent
    runnables.fork req.session.user_id, req.body.parent, (err, runnable) ->
      if err then res.json err.code, { message: err.msg } else
        res.json 201, runnable
  else
    framework = req.query.framework or 'node.js'
    runnables.create req.session.user_id, framework, (err, runnable) ->
      if err then res.json err.code, { message: err.msg } else
        res.json 201, runnable

runnableApp.get '/runnables', (req, res) ->
  if req.query.published
    sortByVotes = req.query.sort is 'votes'
    runnables.listPublished sortByVotes, (err, results) ->
      if err then res.json err.code, { message: err.msg } else
        res.json results
  else if req.query.channel
    sortByVotes = req.query.sort is 'votes'
    runnables.listChannel req.query.channel, sortByVotes, (err, results) ->
      if err then res.json err.code, { message: err.msg } else
        res.json results
  else if req.query.all? is true
    sortByVotes = req.query.sort is 'votes'
    runnables.listAll sortByVotes, (err, results) ->
      if err then res.json err.code, { message: err.msg } else
        res.json results
  else
    sortByVotes = req.query.sort is 'votes'
    runnables.listOwn req.session.user_id, sortByVotes, (err, results) ->
      if err then res.json err.code, { message: err.msg } else
        res.json results

runnableApp.get '/runnables/:id', (req, res) ->
  fetchComments = req.query.comments?
  runnables.get req.params.id, fetchComments, (err, runnable) ->
    if err then res.json err.code, { message: err.msg } else
      res.json runnable

runnableApp.put '/runnables/:id', (req, res) ->
  if not req.body.running? then res.json 403, { msg: 'must provide a running parameter' } else
    if req.body.running
      runnables.start req.session.user_id, req.params.id, (err, runnable) ->
        if err then res.json err.code, { message: err.msg } else
          res.json runnable
    else
      runnables.stop req.session.user_id, req.params.id, (err, runnable) ->
        if err then res.json err.code, { message: err.msg } else
          res.json runnable

runnableApp.del '/runnables/:id', (req, res) ->
  runnables.delete req.session.user_id, req.params.id, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json { message: 'runnable deleted' }

runnableApp.get '/runnables/:id/votes', (req, res) ->
  runnables.getVotes req.params.id, (err, votes) ->
    if err then res.json err.code, { message: err.msg } else
      res.json votes

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

runnableApp.get '/runnables/:id/files', (req, res) ->
  content = req.query.content?
  dir = req.query.dir?
  default_tag = req.query.default?
  path = req.query.path
  runnables.listFiles req.params.id, content, dir, default_tag, path, (err, files) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, files

runnableApp.get '/runnables/:id/files/:fileid', (req, res) ->
  runnables.readFile req.params.id, req.params.fileid, (err, file) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, file

runnableApp.put '/runnables/:id/files/:fileid', (req, res) ->
  if not req.body.content?
    if not req.body.path?
      if not req.body.name?
        if not req.body.default?
          res.json 400, { message: 'must provide content, name, path or tag to update operation' }
        else
          runnables.defaultFile req.session.user_id, req.params.id, req.params.fileid, (err, file) ->
            if err then res.json err.code, { message: err.msg } else
              res.json 200, file
      else
        runnables.renameFile req.session.user_id, req.params.id, req.params.fileid, req.body.name, (err, file) ->
          if err then res.json err.code, { message: err.msg } else
            res.json 200, file
    else
      runnables.moveFile req.session.user_id, req.params.id, req.params.fileid, req.body.path, (err, file) ->
        if err then res.json err.code, { message: err.msg } else
          res.json 200, file
  else
    runnables.updateFile req.session.user_id, req.params.id, req.params.fileid, req.body.content, (err, file) ->
      if err then res.json err.code, { message: err.msg } else
        res.json 200, file

runnableApp.del '/runnables/:id/files', (req, res) ->
  runnables.deleteAllFiles req.params.id, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, { message: 'deleted all files' }

runnableApp.del '/runnables/:id/files/:fileid', (req, res) ->
  recursive = req.query.recursive?
  runnables.deleteFile req.params.id, req.params.fileid, recursive, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json 200, { message: 'file deleted' }