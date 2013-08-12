configs = require '../configs'
debug = require('debug');
domains = require '../domains'
error = require '../error'
express = require 'express'
path = require 'path'
users = require '../models/users'
runnables = require '../models/runnables'

module.exports = (parentDomain) ->

  app = express()

  app.use domains parentDomain

  app.post '/runnables', (req, res) ->
    from = req.query.from or 'node.js'
    if req.query.sync is 'false' then sync = false else sync = true
    runnables.createImage req.domain, req.user_id, from, sync, (err, image) ->
      if err then res.json err.code, { message: err.msg } else
        res.json 201, image

  app.get '/runnables', (req, res) ->
    limit = configs.defaultPageLimit
    if req.query.limit? and req.query.limit <= configs.maxPageLimit
      limit = Number req.query.limit
    page = 0
    if req.query.page?
      page = Number req.query.page
    sortByVotes = req.query.sort is 'votes'
    if req.query.published?
      runnables.listFiltered req.domain, { tags: $not: $size: 0 }, sortByVotes, limit, page, (err, results) ->
        if err then res.json err.code, message: err.msg else
          res.json results
    else if req.query.channel?
      query = if Array.isArray(req.query.channel) then alias: {$in:req.query.channel} else alias: req.query.channel
      channels.findOne query, req.domain.intercept (channel) ->
        if not channel then res.json 400, message: 'could not find channel by that name' else
          runnables.listFiltered req.domain, { tags.channel: channel._id }, sortByVotes, limit, page, (err, results) ->
            if err then res.json err.code, message: err.msg else
              res.json results
    else if req.query.owner?
      runnables.listFiltered req.domain, { owner: req.query.owner }, sortByVotes, limit, page, (err, results) ->
        if err then res.json err.code, message: err.msg else
          res.json results
    else if req.query.map?
      runnables.listNames req.domain, (err, results) ->
        if err then next err else
          res.json results
    else
      runnables.listAll req.domain, sortByVotes, limit, page, (err, results) ->
        if err then res.json err.code, message: err.msg else
          res.json results

  app.put '/runnables/:id', (req, res) ->
    if not req.query.from? then res.json 400, message: 'must provide a runnable to save from' else
      runnables.updateImage req.domain, req.user_id, req.params.id, req.query.from, (err, image) ->
        if err then res.json err.code, message: err.msg else
          res.json image

  app.get '/runnables/:id', (req, res) ->
    runnables.getImage req.domain, req.params.id, (err, runnable) ->
      if err then res.json err.code, message: err.msg else
        res.json runnable

  app.del '/runnables/:id', (req, res) ->
    runnables.removeImage req.domain, req.user_id, req.params.id, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json message: 'runnable deleted'

  app.get '/runnables/:id/votes', (req, res) ->
    runnables.getVotes req.domain, req.params.id, (err, votes) ->
      if err then res.json err.code, message: err.msg else
        res.json votes

  app.get '/runnables/:id/tags', (req, res) ->
    runnables.getTags req.domain, req.params.id, (err, tags) ->
      if err then res.json err.code, message: err.msg else
        res.json tags

  app.post '/runnables/:id/tags', (req, res) ->
    if not req.body.name? then res.json 400, message: 'tag must include a name field' else
      runnables.addTag req.domain, req.user_id, req.params.id, req.body.name, (err, tag) ->
        if err then res.json err.code, message: err.msg else
          res.json 201, tag

  app.get '/runnables/:id/tags/:tagId', (req, res) ->
    runnables.getTag req.domain, req.params.id, req.params.tagId, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json 200, tag

  app.del '/runnables/:id/tags/:tagId', (req, res) ->
    runnables.removeTag req.domain, req.user_id, req.params.id, req.params.tagId, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json 200, { message: 'tag deleted' }

  app.get '/runnables/:id/stats/:stat', (req, res, next) ->
    runnables.getStat req.domain, req.user_id, req.params.id, req.params.stat, (err, stats) ->
      if err then res.json err.code, message: err.msg else
        res.json 200, stats

  app.post '/runnables/:id/stats/:stat', (req, res, next) ->
    runnables.incrementStat req.domain, req.user_id, req.params.id, req.params.stat, (err, stats) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, stats

  app