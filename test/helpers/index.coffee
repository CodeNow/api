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

  createImage: (name, cb) ->
    @authedUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              cb null, res.body._id

  createContainer: (name, cb) ->
    @authedUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then cb err else
                    res.should.have.status 201
                    cb null, user, res.body._id

  createPublishedProject: (user, cb) ->
    @createImage 'node.js', (err, runnableId) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              ownRunnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{ownRunnableId}")
                .end (err, res) ->
                  if err then cb err else
                    res.should.have.status 201
                    cb null, res.body._id

module.exports = Helpers