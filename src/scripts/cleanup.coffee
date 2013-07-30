#pm2 start -c "*/5 * * * *" lib/scripts/cleanup.js

containers = require '../models/containers'
users = require '../models/users'
configs = require '../configs'
dockerjs = require 'docker.js'
domain = require('domain').create()
mongoose = require 'mongoose'
async = require 'async'

mongoose.connect configs.mongo

docker = dockerjs host: configs.docker

domain.on 'error', (err) ->
  # report to services
  console.error 'CLEANUP ERROR:', err.stack
  process.exit 1

docker.listContainers
  queryParams:
    all: true
, domain.intercept (list) ->
  async.filter list, (dockerContainer, cb) ->
    if /^Up /.test dockerContainer.Status
      cb false 
    else
      containers.findOne
        docker_id: dockerContainer.Id.substring 0,12
      , domain.intercept (mongoContainer) ->
        if not mongoContainer? or mongoContainer.deleted 
          cb true
        else
          users.findOne
            _id: mongoContainer.owner
          , domain.intercept (user) ->
            if user? and user.registered 
              cb false 
            else
              cb true
  , domain.intercept (filtered) ->
    console.log 'foo', filtered
    process.exit 0
    ###
    async.each (filtered) ->
      docker.removeContainer
        id: dockerContainer.Id
      , domain.intercept () ->
        containers.remove
          docker_id: dockerContainer.Id.substring(0,12)
        , domain.intercept () ->
    , domain.intercept () ->
    ###
