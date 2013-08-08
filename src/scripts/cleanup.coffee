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
  async.filterSeries list, (dockerContainer, cb) ->
    docker_id = dockerContainer.Id.substring 0,12
    if /^Up /.test dockerContainer.Status
      cb false
    else
      containers.findOne
        docker_id: docker_id
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
  , (filtered) ->
    async.eachLimit filtered, 3, (dockerContainer, cb) ->
      docker.removeContainer
        id: dockerContainer.Id
      , (err) ->
        if err?
          console.error 'failed to remove', dockerContainer.Id
          cb null
        else
          containers.remove
            docker_id: dockerContainer.Id.substring(0,12)
          , domain.intercept () ->
            cb null
    , domain.intercept () ->
      process.exit 0
