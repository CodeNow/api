configs = require '../configs'
express = require 'express'
path = require 'path'
users = require '../models/users'
runnables = require '../models/runnables'

runnableApp = module.exports = express()

runnableApp.post '/runnables', (req, res, next) ->
  if req.body.parent
    runnables.fork req.user_id, req.body.parent, (err, runnable) ->
      if err then next err else
        res.json 201, runnable
  else
    framework = req.query.framework or 'node.js'
    runnables.create req.user_id, framework, (err, runnable) ->
      if err then next err else
        res.json 201, runnable

runnableApp.get '/runnables', (req, res, next) ->

  limit = configs.defaultPageLimit
  if req.query.limit and req.query.limit < configs.maxPageLimit
    limit = Number req.query.limit
  page = 0
  if req.query.page
    page = Number req.query.page
  sortByVotes = req.query.sort is 'votes'

  if req.query.published
    runnables.listFiltered { tags: $not: $size: 0 }, sortByVotes, limit, page, (err, results) ->
      if err then next err else
        res.json results
  else if req.query.channel
    runnables.listFiltered {'tags.name': req.query.channel }, sortByVotes, limit, page, (err, results) ->
      if err then next err else
        res.json results
  else if req.query.owner
    runnables.listFiltered { owner: req.query.owner }, sortByVotes, limit, page, (err, results) ->
      if err then next err else
        res.json results
  else
    runnables.listAll sortByVotes, limit, page, (err, results) ->
      if err then next err else
        res.json results

runnableApp.get '/runnables/:id', (req, res, next) ->
  fetchComments = req.query.comments?
  runnables.get req.params.id, fetchComments, (err, runnable) ->
    if err then next err else
      res.json runnable

runnableApp.put '/runnables/:id', (req, res, next) ->
  if not req.body.running? then next { code: 400, msg: 'must provide a running parameter' } else
    if req.body.running
      runnables.start req.user_id, req.params.id, (err, runnable) ->
        if err then next err else
          res.json runnable
    else
      runnables.stop req.user_id, req.params.id, (err, runnable) ->
        if err then next err else
          res.json runnable

runnableApp.del '/runnables/:id', (req, res, next) ->
  runnables.delete req.user_id, req.params.id, (err) ->
    if err then next err else
      res.json { message: 'runnable deleted' }

runnableApp.get '/runnables/:id/votes', (req, res, next) ->
  runnables.getVotes req.params.id, (err, votes) ->
    if err then next err else
      res.json votes

runnableApp.get '/runnables/:id/comments', (req, res, next) ->
  fetchUsers = req.query.users?
  runnables.getComments req.params.id, fetchUsers, (err, comments) ->
    if err then next err else
      res.json comments

runnableApp.post '/runnables/:id/comments', (req, res, next) ->
  if not req.body.text then next { code: 400, msg: 'comment must include a text field' } else
    users.findUser _id: req.user_id, (err, user) ->
      if err then res.json 500, msg: 'error looking up user' else
        if user.permission_level < 1 then next { code: 403, msg: 'permission denied' } else
          runnables.addComment req.user_id, req.params.id, req.body.text, (err, comment) ->
            if err then next err else
              res.json 201, comment

runnableApp.get '/runnables/:id/comments/:commentId', (req, res, next) ->
  fetchUser = req.query.user?
  runnables.getComment req.params.id, fetchUser, req.params.commentId, (err, comments) ->
    if err then next err else
      res.json comments

runnableApp.del '/runnables/:id/comments/:commentId', (req, res, next) ->
  runnables.removeComment req.user_id, req.params.id, req.params.commentId, (err) ->
    if err then next err else
      res.json 200, { message: 'comment deleted' }

runnableApp.get '/runnables/:id/tags', (req, res, next) ->
  runnables.getTags req.params.id, (err, tags) ->
    if err then next err else
      res.json tags

runnableApp.post '/runnables/:id/tags', (req, res, next) ->
  if not req.body.name then next { code: 400, msg: 'tag must include a name field' } else
    users.findUser _id: req.user_id, (err, user) ->
      if err then res.json 500, msg: 'error looking up user' else
        if user.permission_level < 1 then next { code: 403, msg: 'permission denied' } else
          runnables.addTag req.user_id, req.params.id, req.body.name, (err, tag) ->
            if err then next err else
              res.json 201, tag

runnableApp.get '/runnables/:id/tags/:tagId', (req, res, next) ->
  runnables.getTag req.params.id, req.params.tagId, (err, tag) ->
    if err then next err else
      res.json 200, tag

runnableApp.del '/runnables/:id/tags/:tagId', (req, res, next) ->
  runnables.removeTag req.user_id, req.params.id, req.params.tagId, (err) ->
    if err then next err else
      res.json 200, { message: 'tag deleted' }

runnableApp.post '/runnables/:id/files', (req, res, next) ->
  if req.body.dir
    if not req.body.name then next { code: 400, msg: 'dir must include a name field' } else
      if not req.body.path then next { code: 400, msg: 'dir must include a path field' } else
        runnables.createDirectory req.user_id, req.params.id, req.body.name, req.body.path, (err, dir) ->
          if err then next err else
            res.json 201, dir
  else
    if not req.body.name then next { code: 400, msg: 'file must include a name field' } else
      if not req.body.content then next { code: 400, msg: 'file must include a content field' } else
        if not req.body.path then next { code: 400, msg: 'file must include a path field' } else
          runnables.createFile req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, (err, file) ->
            if err then next err else
              res.json 201, file

runnableApp.get '/runnables/:id/files', (req, res, next) ->
  content = req.query.content?
  dir = req.query.dir?
  default_tag = req.query.default?
  path = req.query.path
  runnables.listFiles req.params.id, content, dir, default_tag, path, (err, files) ->
    if err then next err else
      res.json 200, files

runnableApp.get '/runnables/:id/files/:fileid', (req, res, next) ->
  runnables.readFile req.params.id, req.params.fileid, (err, file) ->
    if err then next err else
      res.json 200, file

runnableApp.put '/runnables/:id/files/:fileid', (req, res, next) ->
  if not req.body.content?
    if not req.body.path?
      if not req.body.name?
        if not req.body.default?
          next { code: 400, msg: 'must provide content, name, path or tag to update operation' }
        else
          runnables.defaultFile req.user_id, req.params.id, req.params.fileid, (err, file) ->
            if err then next err else
              res.json 200, file
      else
        runnables.renameFile req.user_id, req.params.id, req.params.fileid, req.body.name, (err, file) ->
          if err then next err else
            res.json 200, file
    else
      runnables.moveFile req.user_id, req.params.id, req.params.fileid, req.body.path, (err, file) ->
        if err then next err else
          res.json 200, file
  else
    runnables.updateFile req.user_id, req.params.id, req.params.fileid, req.body.content, (err, file) ->
      if err then next err else
        res.json 200, file

runnableApp.del '/runnables/:id/files', (req, res, next) ->
  runnables.deleteAllFiles req.params.id, (err) ->
    if err then next err else
      res.json 200, { message: 'deleted all files' }

runnableApp.del '/runnables/:id/files/:fileid', (req, res, next) ->
  recursive = req.query.recursive?
  runnables.deleteFile req.params.id, req.params.fileid, recursive, (err) ->
    if err then next err else
      res.json 200, { message: 'file deleted' }