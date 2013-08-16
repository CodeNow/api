configs = require '../configs'
specifications = require '../models/specifications'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/specifications', (req, res) ->
    specifications.createSpecification req.domain, 
      userId: req.user_id
      name: req.body.name 
      description: req.body.description
      instructions: req.body.instructions
      requirements: req.body.requirements
    , (err, specification) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, specification

  app.get '/specifications', (req, res) ->
    specifications.listSpecifications req.domain, (err, specifications) ->
      if err then res.json err.code, message: err.msg else
        res.json specifications

  app.get '/specifications/:id', (req, res) ->
    specifications.getSpecification req.domain, req.params.id, (err, specification) ->
      if err then res.json err.code, message: err.msg else
        res.json specification

  app.put '/specifications/:id', (req, res) ->
    specifications.updateSpecification req.domain, 
      userId: req.user_id 
      specificationId: req.params.id
      name: req.body.name
      description: req.body.description
      instructions: req.body.instructions
      requirements: req.body.requirements
    , (err, specification) ->
      if err then res.json err.code, message: err.msg else
        res.json specification

  app.del '/specifications/:id', (req, res) ->
    specifications.deletespecification req.domain, 
      userId: req.user_id
      specificationId: req.params.id
    , (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'specification deleted' }

  app