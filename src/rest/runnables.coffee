configs = require '../configs'
error = require '../error'
express = require 'express'
path = require 'path'
users = require '../models/users'
runnables = require '../models/runnables'

app = module.exports = express()

app.post '/runnables', (req, res, next) ->
  from = req.body.from or 'node.js'
  runnables.createImage req.user_id, from, (err, image) ->
    if err then next err else
      res.json 201, image

app.get '/runnables', (req, res, next) ->

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

app.get '/runnables/:id', (req, res, next) ->
  fetchComments = false
  runnables.get req.params.id, fetchComments, (err, runnable) ->
    if err then next err else
      res.json runnable

app.put '/runnables/:id', (req, res, next) ->
  if not req.body.running? then next new error { code: 400, msg: 'must provide a running parameter' } else
    if req.body.running
      runnables.start req.user_id, req.params.id, (err, runnable) ->
        if err then next err else
          res.json runnable
    else
      runnables.stop req.user_id, req.params.id, (err, runnable) ->
        if err then next err else
          res.json runnable

app.del '/runnables/:id', (req, res, next) ->
  runnables.delete req.user_id, req.params.id, (err) ->
    if err then next err else
      res.json { message: 'runnable deleted' }

app.get '/runnables/:id/votes', (req, res, next) ->
  runnables.getVotes req.params.id, (err, votes) ->
    if err then next err else
      res.json votes

app.get '/runnables/:id/tags', (req, res, next) ->
  runnables.getTags req.params.id, (err, tags) ->
    if err then next err else
      res.json tags

app.post '/runnables/:id/tags', (req, res, next) ->
  if not req.body.name then next new error { code: 400, msg: 'tag must include a name field' } else
    users.findUser _id: req.user_id, (err, user) ->
      if err then next err else
        if user.permission_level < 1 then next new error { code: 403, msg: 'permission denied' } else
          runnables.addTag req.user_id, req.params.id, req.body.name, (err, tag) ->
            if err then next err else
              res.json 201, tag

app.get '/runnables/:id/tags/:tagId', (req, res, next) ->
  runnables.getTag req.params.id, req.params.tagId, (err, tag) ->
    if err then next err else
      res.json 200, tag

app.del '/runnables/:id/tags/:tagId', (req, res, next) ->
  runnables.removeTag req.user_id, req.params.id, req.params.tagId, (err) ->
    if err then next err else
      res.json 200, { message: 'tag deleted' }