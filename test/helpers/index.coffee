apiserver = require '../../lib'
async = require 'async'
cp = require 'child_process'
configs = require '../../lib/configs'
domain = require 'domain'
sa = require 'superagent'

Helpers =

  createServer: (configs, done, cb) ->
    d = domain.create()
    d.on 'error', (err) ->
      instance.stop () -> done err
    instance = new apiserver configs, d
    d.run () ->
      instance.start (err) ->
        if err then cb err else
          cb null, instance

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
            patch: (url) -> user.patch(url).set('runnable-token', token)
            post: (url) -> user.post(url).set('runnable-token', token)
            get: (url)  -> user.get(url).set('runnable-token', token)
            put: (url)  -> user.put(url).set('runnable-token', token)
            del: (url)  -> user.del(url).set('runnable-token', token)

  authedRegisteredUser: (cb) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then cb err else
          res.should.have.status 201
          token = res.body.access_token
          user.put("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', token)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify( email: 'jeff@runnable.com', username: 'jeff@runnable.com', password: 'notmyrealone'))
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 200
                cb null,
                  patch: (url) -> user.patch(url).set('runnable-token', token)
                  post: (url) -> user.post(url).set('runnable-token', token)
                  get:  (url) -> user.get(url).set('runnable-token', token)
                  put:  (url) -> user.put(url).set('runnable-token', token)
                  del:  (url) -> user.del(url).set('runnable-token', token)

  authedAdminUser: (cb) ->
    user = sa.agent()
    oldSalt = configs.passwordSalt
    delete configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify( email: 'test4@testing.com', password: 'testing'))
      .end (err, res) ->
        if err then cb err else
          res.should.have.status 200
          token = res.body.access_token
          configs.passwordSalt = oldSalt
          cb null,
            patch: (url) -> user.patch(url).set('runnable-token', token)
            post: (url) -> user.post(url).set('runnable-token', token)
            get:  (url) -> user.get(url).set('runnable-token', token)
            put:  (url) -> user.put(url).set('runnable-token', token)
            del:  (url) -> user.del(url).set('runnable-token', token)

  createChannel: (name, cb) ->
    @authedAdminUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/channels")
          .set('content-type', 'application/json')
          .send(JSON.stringify(name: name))
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              cb null, res.body

  createChannels: (names, cb) ->
    @authedAdminUser (err, user) ->
      if err then cb err else
        async.map names, (name, cb) ->
          user.post("http://localhost:#{configs.port}/channels")
            .set('content-type', 'application/json')
            .send(JSON.stringify(name: name))
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 201
                cb null, res.body
        , cb

  createCategory: (name, cb) ->
    @authedAdminUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/categories")
          .set('content-type', 'application/json')
          .send(JSON.stringify(name: name))
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              cb null, res.body

  createImage: (name, cb) ->
    @authedUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=#{name}")
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              cb null, res.body._id

  createUnsyncedImage: (name, cb) ->
    @authedUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=#{name}&sync=false")
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              cb null, res.body._id

  createTaggedImage: (name, tag, cb) ->
    @authedRegisteredUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=#{name}")
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                .set('content-type', 'application/json')
                .send(JSON.stringify({name: tag}))
                .end (err, res) ->
                  if err then cb err else
                    res.should.have.status 201
                    cb null, runnableId

  createNamedTaggedImage: (user, source, name, tag, cb) ->
    user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{source}")
      .end (err, res) ->
        if err then cb err else
          res.should.have.status 201
          userRunnableId = res.body._id
          user.put("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}")
            .set('content-type', 'application/json')
            .send(JSON.stringify({ name: name, running: false }))
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 200
                user.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                  .end (err, res) ->
                    if err then cb err else
                      res.should.have.status 201
                      runnableId = res.body._id
                      user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify({name: tag}))
                        .end (err, res) ->
                          if err then cb err else
                            res.should.have.status 201
                            cb null, runnableId

  createContainer: (name, cb) ->
    @authedUser (err, user) ->
      if err then cb err else
        user.post("http://localhost:#{configs.port}/runnables?from=#{name}")
          .end (err, res) ->
            if err then cb err else
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

  sendCommand: (url, cmd, cb) ->
    ptm = cp.spawn 'phantomjs', [ './term.js', url, cmd ], { cwd: __dirname }
    output_buffer = ''
    ptm.on 'close', (code, signal) ->
      if code isnt 0 then cb new Error 'error calling phantomjs: ' + output_buffer else
        cb null, output_buffer
    ptm.stdout.on 'data', (data) ->
      output_buffer += data.toString()

module.exports = Helpers