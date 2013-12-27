apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'error handler', ->

  it 'should respond with server ::error if throw occurs inside express handler', (done) ->
    user = sa.agent()
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/test/throw/express")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 500
                  res.body.should.have.property 'message', 'something bad happened :('
                  res.body.should.have.property 'error', 'express'
                  configs.throwErrors = true
                  instance.stop done

  it 'should respond with server ::error if throw occurs asynchrounously from express handler', (done) ->
    user = sa.agent()
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/test/throw/express_async")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 500
                  res.body.should.have.property 'message', 'something bad happened :('
                  res.body.should.have.property 'error', 'express_async'
                  configs.throwErrors = true
                  instance.stop done

  it 'should respond with server ::error if throw occurs via a connection pool emitted handler', (done) ->
    user = sa.agent()
    configs.throwErrors = false
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/test/throw/mongo_pool")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 500
                  res.body.should.have.property 'message', 'something bad happened :('
                  res.body.should.have.property 'error', 'mongo_pool'
                  configs.throwErrors = true
                  instance.stop done

  it 'should respond with server ::error if throw occurs outside of any domain handler', (done) ->
    user = sa.agent()
    configs.throwErrors = false
    mochaHandler = process.listeners('uncaughtException').pop()
    process.removeListener 'uncaughtException', mochaHandler
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createUser user, (err, token) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/test/throw/no_domain")
              .set('runnable-token', token)
              .timeout(500) # this will timeout as server has no error context
              .end (err, res) ->
                if not err then done new Error 'expected server to crash in middle of request' else
                  err.should.have.property 'message', 'timeout of 500ms exceeded'
                  process.listeners('uncaughtException').push mochaHandler
                  configs.throwErrors = true
                  done()