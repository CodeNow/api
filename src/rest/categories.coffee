configs = require '../configs'
categories = require '../models/categories'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/categories', (req, res) ->
    categories.createCategory req.domain, req.user_id, req.body.name, req.body.description, (err, category) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, category

  app.get '/categories', (req, res) ->
    categories.listCategories req.domain, (err, categories) ->
      if err then res.json err.code, message: err.msg else
        res.json categories

  app.get '/categories/:id', (req, res) ->
    categories.getCategory req.domain, req.params.id, (err, category) ->
      if err then res.json err.code, message: err.msg else
        res.json category

  app.put '/categories/:id', (req, res) ->
    categories.updateCategory req.domain, req.user_id, req.params.id, req.body.name, req.body.description, (err, category) ->
      if err then res.json err.code, message: err.msg else
        res.json category

  app.del '/categories/:id', (req, res) ->
    categories.deleteCategory req.domain, req.user_id, req.params.id, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'category deleted' }

  app