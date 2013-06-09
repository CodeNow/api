apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'channels api', ->

  it 'should list out the ::channels', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/channels")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.be.a.array
          res.body.should.includeEql name: 'facebook'
          res.body.should.includeEql name: 'google'
          res.body.should.includeEql name: 'twitter'
          res.body.should.includeEql name: 'jquery'
          done()