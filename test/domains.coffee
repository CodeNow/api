apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'domain', ->

  it 'should catch error in ::domain when when docker.js calls back with an error code', (done) ->
    images = require '../lib/models/images'
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