apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'hibernate feature', ->

  it 'should allow for a container to enter ::hibernate mode and then shut down', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        setTimeout () ->
          done()
        , 1500

  it 'should allow for a container to enter ::hibernate mode and then wake it up by reading a file', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        setTimeout () ->
          user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                fileId = res.body[0]._id
                user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.have.property 'name'
                      done()
        , 10000

  it 'should allow for a container to enter ::hibernate mode and then read its native state by getting container', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        setTimeout () ->
          user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.have.property 'running', false
                done()
        , 10000

  it 'should allow for a container to start, enter ::hibernate mode and then read its native state by getting container', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
          .set('content-type', 'application/json')
          .send(JSON.stringify({ name: 'new name', running: true }))
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              setTimeout () ->
                user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.have.property 'running', false
                      done()
              , 10000

  it 'should allow for a container to enter ::hibernate mode and then wake it up by starting a runnable', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        setTimeout () ->
          user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
            .set('content-type', 'application/json')
            .send(JSON.stringify({ name: 'new name', running: true }))
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                done()
        , 10000

  it 'should allow for a container to enter ::hibernate mode and then wake it up by reading a file twice', (done) ->
    helpers.createContainer 'node.js', (err, user, runnableId) ->
      if err then done err else
        setTimeout () ->
          user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                fileId = res.body[0]._id
                user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.have.property 'name'
                      setTimeout () ->
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'name'
                              done()
                      , 10000
        , 10000


  it 'should take container out of ::hibernate when the ::terminal is accessed', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  res.body.should.have.property 'token'
                  token = res.body.token
                  terminalUrl = "http://terminals.runnableapp.dev/term.html?termId=#{token}"
                  helpers.sendCommand terminalUrl, 'rm server.js', (err, output) ->
                    if err then done err else
                      user.post("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/sync")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  res.body.length.should.equal 2
                                  done()

  it 'should take the container out of ::hibernate when the web service is accessed'
  it 'should take the container out of ::hibernate when the tail log is accessed'