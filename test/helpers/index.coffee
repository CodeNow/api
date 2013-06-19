configs = require '../../lib/configs'
sa = require 'superagent'

Helpers =

  createUser: (user, cb) ->
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then cb err else
          res.should.have.status 201
          res.type.should.equal 'application/json'
          res.body.should.have.property 'access_token'
          res.body.should.have.property '_id'
          userId = res.body._id
          access_token = res.body.access_token
          cb null, access_token

  authedUser: (cb) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then cb err else
          res.should.have.status 201
          token = res.body.access_token
          cb null,
            post: (url) -> user.post(url).set('runnable-token', token)
            get: (url) -> user.get(url).set('runnable-token', token)
            put: (url) -> user.put(url).set('runnable-token', token)
            del: (url) -> user.del(url).set('runnable-token', token)

module.exports = Helpers