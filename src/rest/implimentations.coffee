configs = require '../configs'
implimentations = require '../models/implimentations'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/implimentations', (req, res) ->
    implimentations.createSpecification req.domain, 
      userId: req.user_id
      name: req.body.name 
      description: req.body.description
      instructions: req.body.instructions
      requirements: req.body.requirements
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, implimentation

  app.get '/implimentations', (req, res) ->
    implimentations.listSpecifications req.domain, req.user_id, (err, implimentations) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentations

  app.get '/implimentations/:id', (req, res) ->
    implimentations.getSpecification req.domain, 
      userId: req.user_id
      implimentationId: req.params.id
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentation

  app.put '/implimentations/:id', (req, res) ->
    implimentations.updateSpecification req.domain, 
      userId: req.user_id 
      implimentationId: req.params.id
      name: req.body.name
      description: req.body.description
      instructions: req.body.instructions
      requirements: req.body.requirements
    , (err, implimentation) ->
      if err then res.json err.code, message: err.msg else
        res.json implimentation

  app.del '/implimentations/:id', (req, res) ->
    implimentations.deleteimplimentation req.domain, 
      userId: req.user_id
      implimentationId: req.params.id
    , (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'implimentation deleted' }

  app