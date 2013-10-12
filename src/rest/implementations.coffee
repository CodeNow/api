configs = require '../configs'
implementations = require '../models/implementations'
domains = require '../domains'
error = require '../error'
express = require 'express'

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  app.post '/users/me/implementations', (req, res) ->
    implementations.createImplementation req.domain,
      userId: req.user_id
      implements: req.body.implements
      containerId: req.body.containerId
      requirements: req.body.requirements
      subdomain: req.body.subdomain
    , (err, implementation) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, implementation

  app.get '/users/me/implementations', (req, res) ->
    if req.query.implements
      implementations.getImplementationBySpecification req.domain,
        userId: req.user_id
        implements: req.query.implements
      , (err, implementation) ->
        if err then res.json err.code, message: err.msg else
          res.json implementation
    else
      implementations.listImplementationsForUser req.domain, req.user_id, (err, implementations) ->
        if err then res.json err.code, message: err.msg else
          res.json implementations

  app.get '/users/me/implementations/:id', (req, res) ->
    implementations.getImplementation req.domain,
      userId: req.user_id
      implementationId: req.params.id
    , (err, implementation) ->
      if err then res.json err.code, message: err.msg else
        res.json implementation

  app.put '/users/me/implementations/:id', (req, res) ->
    implementations.updateImplementation req.domain,
      userId: req.user_id
      implementationId: req.params.id
      requirements: req.body.requirements
    , (err, implementation) ->
      if err then res.json err.code, message: err.msg else
        res.json implementation

  app.del '/users/me/implementations/:id', (req, res) ->
    implementations.deleteImplementation req.domain,
      userId: req.user_id
      implementationId: req.params.id
    , (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'implementation deleted' }

  app