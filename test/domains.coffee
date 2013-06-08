apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'
should = require 'should'

describe 'domains', ->
  it 'should return a 500 on a thrown error', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/zomg")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 500
          done()