apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'channels api', ->

  it 'should list out the ::channels', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      user.get("http://localhost:#{configs.port}/channels")
        .set('runnable-token', token)
        .end (err, res) ->
          if err then done err else
            res.should.have.status 200
            res.body.should.be.a.array
            res.body.should.includeEql name: 'facebook'
            res.body.should.includeEql name: 'google'
            res.body.should.includeEql name: 'twitter'
            res.body.should.includeEql name: 'jquery'
            done()