apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'api', ->

  it 'should respond with "runnable api" at the root path ::base', (done) ->
    user = sa.agent()
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.message.should.equal 'runnable api'
                  res.type.should.equal 'application/json'
                  instance.stop done

  it 'should return generic/catchall 404 resource not found when hit with unknown route ::base', (done) ->
    user = sa.agent()
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/blah")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.body.message.should.equal 'resource not found'
                  instance.stop done

  it 'should be able to invoke container cleanup as an admin user ::base ::current', (done) ->
    user = sa.agent()
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createAdminUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/cleanup")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  instance.stop done

  it 'should be able to invoke container cleanup as an admin user ::base ::current', (done) ->
    user = sa.agent()
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/cleanup")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.message.should.equal 'permission denied'
                  instance.stop done