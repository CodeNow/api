apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
images = require '../lib/models/images'
containers = require '../lib/models/containers'

describe 'domain', ->

  it 'should return server error response when docker.js createContainer() ::fails', (done) ->
    oldFunc = images.docker.createContainer
    images.docker.createContainer = (params, cb) ->
      cb new Error 'Docker is returning an error here'
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 500
                  res.body.should.have.property 'message', 'something bad happened :('
                  configs.throwErrors = true
                  images.docker.createContainer = oldFunc
                  instance.stop done

  it 'should return server error response when docker.js inspectContainer() ::fails', (done) ->
    oldFunc = images.docker.inspectContainer
    images.docker.inspectContainer = (params, cb) ->
      cb new Error 'Docker is returning an error here'
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 500
                  res.body.should.have.property 'message', 'something bad happened :('
                  configs.throwErrors = true
                  images.docker.inspectContainer = oldFunc
                  instance.stop done

  it 'should return server error response when docker.js removeContainer() ::fails', (done) ->
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  runnableId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        userRunnableId = res.body._id
                        oldFunc = containers.docker.removeContainer
                        containers.docker.removeContainer = (params, cb) ->
                          cb new Error 'Docker is returning an error here'
                        user.del("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 500
                              res.body.should.have.property 'message', 'something bad happened :('
                              configs.throwErrors = true
                              containers.docker.removeContainer = oldFunc
                              instance.stop done