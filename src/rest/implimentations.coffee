configs = require '../configs'
implimentations = require '../models/implimentations'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/implimentations', (req, res) ->
    implimentations.createImplimentation req.domain, 
      userId: req.user_id
      specificationId: req.body.specificationId
      requirements: req.body.requirements
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, implimentation

  app.get '/implimentations', (req, res) ->
    implimentations.listImplimentations req.domain, req.user_id, (err, implimentations) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentations

  app.get '/implimentations/:id', (req, res) ->
    implimentations.getImplimentation req.domain, 
      userId: req.user_id
      implimentationId: req.params.id
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentation

  app.put '/implimentations/:id', (req, res) ->
    implimentations.updateImplimentation req.domain, 
      userId: req.user_id 
      implimentationId: req.params.id
      requirements: req.body.requirements
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentation

  app.del '/implimentations/:id', (req, res) ->
    implimentations.deleteImplimentation req.domain, 
      userId: req.user_id
      implimentationId: req.params.id
    , (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'implimentation deleted' }

  app