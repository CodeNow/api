apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
images = require '../lib/models/images'
containers = require '../lib/models/containers'

describe 'domain', ->

  it 'should catch error in ::domain when docker.js createContainer() calls back with an error code', (done) ->
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

  it 'should catch error in ::domain when docker.js inspectContainer() calls back with an error code', (done) ->
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

  it 'should catch error in ::domain when docker.js removeContainer() calls back with an error code', (done) ->
    oldFunc = images.docker.removeContainer
    images.docker.removeContainer = (params, cb) ->
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
                  images.docker.removeContainer = oldFunc
                  instance.stop done