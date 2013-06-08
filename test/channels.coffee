apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'
should = require 'should'

describe 'Our channel system', ->

  it 'should list out the ::channels', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/channels")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.be.a.array
          res.body.should.include 'facebook'
          res.body.should.include 'google'
          res.body.should.include 'twitter'
          res.body.should.include 'jquery'
          done()