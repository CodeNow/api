apiserver = require '../lib'
helpers = require './helpers'
configs = require '../lib/configs'
redis = require 'redis'
sa = require 'superagent'
uuid = require 'node-uuid'
async = require 'async'
qs = require 'querystring'

describe 'user api', ->

  it 'should create a new ::user', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.type.should.equal 'application/json'
          res.body.should.have.property 'access_token'
          res.body.should.have.property '_id'
          userId = res.body._id
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.not.have.property 'access_token'
                res.body.should.have.property '_id', userId
                done()

  it 'should return unauthorized if access token is not provided for ::user', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .set('runnable-token', 'bad_token')
      .end (err, res) ->
        if err then done err else
          res.should.have.status 401
          res.body.should.have.property 'message', 'must provide a valid access token'
          res.body.should.not.have.property '_id'
          done()

  it 'should return unauthorized if access token is invalid for ::user', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 401
          res.body.should.have.property 'message', 'access token required'
          res.body.should.not.have.property '_id'
          done()

  it 'should return user not found when using a stale access token from an old ::user session', (done) ->
    user = sa.agent()
    redis_client = redis.createClient()
    access_token = uuid.v4()
    redis_client.psetex [ access_token, 1000, '51b2347626201e421a000002' ], (err) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 404
              res.body.should.have.property 'message', 'user doesnt exist'
              done()

  it 'should return error when ::user id is not a valid mongo objectid', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/1235")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 500
              res.body.should.have.property 'message', 'error looking up user'
              done()

  it 'should return ::user not found when user id does not exist in database', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/51b2347626201e421a000002")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 404
              res.body.should.have.property 'message', 'user not found'
              done()

  it 'should load the existing anonymous ::user on subsequent accesses', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.get("http://localhost:#{configs.port}/users/me")
                .set('runnable-token', access_token)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body._id.should.equal userId
                    done()

  it 'should invalidate the ::users access token after its time to live', (done) ->
    user = sa.agent()
    oldExpires = apiserver.configs.tokenExpires
    apiserver.configs.tokenExpires = 250
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              setTimeout ->
                user.get("http://localhost:#{configs.port}/users/me")
                  .set('runnable-token', access_token)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 401
                      res.body.should.have.property 'message', 'must provide a valid access token'
                      apiserver.configs.tokenExpires = oldExpires
                      done()
              , 300

  it 'should be able to access ::user info through canonical path', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              created = res.body.created
              process.nextTick ->
                user.get("http://localhost:#{configs.port}/users/#{userId}")
                  .set('runnable-token', access_token)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body._id.should.equal userId
                      res.body.created.should.equal created
                      done()

  it 'should not allow a ::user access to another users private data', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              userId = res.body._id
              user2 = sa.agent()
              helpers.createUser user, (err, access_token2) ->
                if err then done err else
                  user2.get("http://localhost:#{configs.port}/users/#{userId}")
                    .set('runnable-token', access_token2)
                    .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          done()

  it 'should allow ::user to delete their own account', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.del("http://localhost:#{configs.port}/users/#{userId}")
                .set('runnable-token', access_token)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    user.get("http://localhost:#{configs.port}/users/me")
                      .set('runnable-token', access_token)
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 404
                          done()

  it 'should not allow another ::user to delete someone elses account', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user2 = sa.agent()
              helpers.createUser user, (err, access_token2) ->
                if err then done err else
                  user2.get("http://localhost:#{configs.port}/users/me")
                    .set('runnable-token', access_token2)
                    .end (err, res) ->
                      if err then done err else
                        user2.del("http://localhost:#{configs.port}/users/#{userId}")
                          .set('runnable-token', access_token2)
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              done()

  it 'should be able to to fetch a new ::user token with username and password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.have.property 'access_token'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should be able to to login with a fetched ::user access token', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.have.property 'access_token'
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.have.property 'username', 'matchusername5'
                apiserver.configs.passwordSalt = oldSalt
                done()

  it 'should return an error when we ::login with a ::user that doesnt exist', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'doesntexit', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 404
          res.should.have.property 'body'
          res.body.should.have.property 'message', 'user not found'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should include a ::gravitar url in ::user model', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              res.should.have.status 200
              res.body.should.have.property 'gravitar', 'http://www.gravatar.com/avatar/c7f9034f0263d811384e9b3f09099779'
              apiserver.configs.passwordSalt = oldSalt
              done()

  it 'should allow a ::user to be created with a username and password', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'does@notexist.com', username: 'does@notexist.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.body.should.have.property 'access_token'
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.have.property 'permission_level', 1
                done()

  it 'should allow a ::user to upgrade to registered with a username and password', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          access_token = res.body.access_token
          user.put("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify( email: 'jeff@runnable.com', username: 'jeff@runnable.com', password: 'notmyrealone'))
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.have.property 'permission_level', 1
                done()

  it 'should filter out the ::users password field on return data', (done) ->
    user = sa.agent()
    userEmail = 'another_test@user.com'
    data = JSON.stringify
      email: userEmail
      username: userEmail
      password: 'this_should_be_hashed'
    user.post("http://localhost:#{configs.port}/users")
      .set('Content-Type', 'application/json')
      .send(data)
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          access_token = res.body.access_token
          res.body.email.should.equal userEmail
          res.body.should.not.have.property 'password'
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.not.have.property 'password'
                done()

  it 'should store a ::user password as plaintext when ::passhashing is disabled', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    userEmail = 'another_test@user.com'
    data = JSON.stringify
      email: userEmail
      username: userEmail
      password: 'this_should_be_hashed'
    user.post("http://localhost:#{configs.port}/users")
      .set('Content-Type', 'application/json')
      .send(data)
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.body.email.should.equal userEmail
          res.body.should.not.have.property 'password'
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                res.body.should.not.have.property 'password'
                apiserver.configs.passwordSalt = oldSalt
                done()

  it 'should not allow a ::user to ::login with an invalid password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'notpassword' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 403
          res.body.should.have.property 'message', 'invalid password'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow a ::user to ::login with an invalid password with hashing enabled', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/users")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          access_token = res.body.access_token
          user.get("http://localhost:#{configs.port}/users/me")
            .set('runnable-token', access_token)
            .end (err, res) ->
              if err then done err else
                userEmail = 'another_test@user.com'
                data = JSON.stringify
                  email: userEmail
                  username: userEmail
                  password: 'mypassword'
                userId = res.body._id
                user.put("http://localhost:#{configs.port}/users/me")
                  .set('runnable-token', access_token)
                  .set('Content-Type', 'application/json')
                  .send(data)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body._id.should.equal userId
                      res.body.email.should.equal userEmail
                      res.body.password.should.not.equal 'mypassword'
                      user2 = sa.agent()
                      user2.post("http://localhost:#{configs.port}/token")
                        .set('Content-Type', 'application/json')
                        .send(JSON.stringify({ email: 'another_test@user.com', password: 'notmypassword' }))
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 403
                            res.body.should.have.property 'message', 'invalid password'
                            done()

  it 'should hash a ::users password when we ::register a user with ::passhashing is enabled', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                username: userEmail
                password: 'this_should_be_hashed'
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('Content-Type', 'application/json')
                .set('runnable-token', token)
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body._id.should.equal userId
                    res.body.email.should.equal userEmail
                    res.body.password.should.not.equal 'this_should_be_hashed'
                    done()

  it 'should not allow a ::user to double register', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, access_token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', access_token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                username: userEmail
                password: 'mypassword'
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('runnable-token', access_token)
                .set('Content-Type', 'application/json')
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body._id.should.equal userId
                    res.body.email.should.equal userEmail
                    user.put("http://localhost:#{configs.port}/users/me")
                      .set('runnable-token', access_token)
                      .set('Content-Type', 'application/json')
                      .send(data)
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          res.body.should.have.property 'message', 'you are already registered'
                          done()

  it 'should not allow a ::user to ::register without a password', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                username: userEmail
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('runnable-token', token)
                .set('Content-Type', 'application/json')
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 400
                    res.body.should.have.property 'message', 'must provide a password to register with'
                    done()

  it 'should not allow a ::user to ::register without a username', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                password: 'mypassword'
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('runnable-token', token)
                .set('Content-Type', 'application/json')
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 400
                    res.body.should.have.property 'message', 'must provide a username to register with'
                    done()

  it 'should not allow a ::user to ::register without an email address', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                username: userEmail
                password: 'mypassword'
              userId = res.body._id
              process.nextTick () ->
                user.put("http://localhost:#{configs.port}/users/me")
                  .set('runnable-token', token)
                  .set('Content-Type', 'application/json')
                  .send(data)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 400
                      res.body.should.have.property 'message', 'must provide an email to register with'
                      done()

  it 'should not allow a ::user to ::login without a username or password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 400
          res.body.should.have.property 'message', 'username or email required'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow a ::user to ::login without a password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 400
          res.body.should.have.property 'message', 'password required'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow us to ::register a ::user that already exists', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                username: userEmail
                password: 'mypassword'
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('Content-Type', 'application/json')
                .set('runnable-token', token)
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body._id.should.equal userId
                    res.body.email.should.equal userEmail
                    user2 = sa.agent()
                    helpers.createUser user, (err, token2) ->
                      if err then done err else
                        user2.put("http://localhost:#{configs.port}/users/me")
                          .set('Content-Type', 'application/json')
                          .set('runnable-token', token2)
                          .send(data)
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'user already exists'
                              done()


  it 'should allow a ::user to ::login with their correct password with hashing enabled', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              userEmail = 'another_test@user.com'
              data = JSON.stringify
                email: userEmail
                username: userEmail
                password: 'this_should_be_hashed'
              userId = res.body._id
              user.put("http://localhost:#{configs.port}/users/me")
                .set('runnable-token', token)
                .set('Content-Type', 'application/json')
                .send(data)
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body._id.should.equal userId
                    res.body.email.should.equal userEmail
                    user2 = sa.agent()
                    helpers.createUser user, (err, token2) ->
                      if err then done err else
                        user2.post("http://localhost:#{configs.port}/token")
                          .set('Content-Type', 'application/json')
                          .set('runnable-token', token2)
                          .send(JSON.stringify({ username: 'another_test@user.com', password: 'this_should_be_hashed' }))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'access_token'
                              token = res.body.access_token
                              user.get("http://localhost:#{configs.port}/users/me")
                                .set('runnable-token', token)
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property '_id', userId
                                    done()

  it 'should be possible to list ::users with ids specified in query param', (done) ->
    count = 0
    numUsers = 5
    userIds = []
    user = null
    token = null
    async.whilst () ->
      count < numUsers
    , (cb) ->
        user = sa.agent()
        helpers.createUser user, (err, userToken) ->
          if err then done err else
            token = userToken
            user.get("http://localhost:#{configs.port}/users/me")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.body.should.have.property '_id'
                  userIds.push(res.body._id)
                  count++
                  cb()
    , (err) ->
        if err then done err else
          userIds.pop() # so it's not all of the users
          query = ids: userIds
          user.get("http://localhost:#{configs.port}/users?#{qs.encode(query)}")
            .set('runnable-token', token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.be.a.array
                res.body.length.should.equal numUsers-1
                res.body.forEach (user) ->
                  userIds.should.include user._id
                done()