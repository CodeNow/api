apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'
should = require 'should'

describe 'Our runnable system', ->

  it 'should be able to create a new default ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          should.exist res.body
          should.exist res.body.framework
          res.body.framework.should.equal 'node.js'
          done()

  it 'should be able to create a new node.js ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          should.exist res.body
          console.log res.body
          done()

  it 'should report error if the ::runnable framework does not exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          should.exist res.body
          console.log res.body
          done()