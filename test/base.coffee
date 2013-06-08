configs = require '../lib/configs'
sa = require 'superagent'

describe 'api', ->

  it 'should return a 500 on a thrown error', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/throws")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 500
          done()

  it 'should respond with hello at the root path', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.message.should.equal 'hello!'
          res.type.should.equal 'application/json'
          done()

  it 'should return 404 not found when hit with unknown route', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/blah")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 404
          res.body.message.should.equal 'operation not found'
          done()