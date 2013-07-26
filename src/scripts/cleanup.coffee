###

  pm2 start -c "*/5 * * * *" lib/scripts/cleanup.js

###
containers = require '../models/containers'
users = require '../models/users'
configs = require '../../configs'
dockerjs = require 'docker.js'
domain = require('domain').create()
async = require 'async'

docker = dockerjs host: configs.docker

domain.on 'error', (err) ->
  # report to services
  console.error 'CLEANUP ERROR:', err

docker.listContainers
  all: true
, domain.intercept (list) ->
  async.filter list, (dockerContainer, cb) ->
    if /^Up /.test dockerContainer.Status then cb false else
      containers.findOne
        docker_id: dockerContainer.Id.substring(0,12)
      , domain.intercept (mongoContainer) ->
        if mongoContainer.deleted then cb true else
          users.findOne
            _id: mongoContainer.owner
          , domain.intercept (user) ->
            if user.registered then cb false else
              cb true
  , domain.intercept (filtered) ->
    async.each (filtered) -> 
      docker.removeContainer 
        id: dockerContainer.Id
      , domain.intercept () ->
        containers.remove
          docker_id: dockerContainer.Id.substring(0,12)
        , domain.intercept () ->
    , domain.intercept () ->