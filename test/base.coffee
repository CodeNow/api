configs = require '../lib/configs'
sa = require 'superagent'

describe 'Our base system', ->

  it 'should respond with hello at the root path', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.message.should.equal 'hello!'
          res.type.should.equal 'application/json'
          done()