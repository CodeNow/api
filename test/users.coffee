async = require 'async'
configs = require '../lib/configs'
mongodb = require 'mongodb'
redis = require 'redis'
should = require 'should'
sa = require 'superagent'

apiserver = require '../lib'
state = require './state'
db = mongodb.Db

beforeEach (done) ->
  db.connect configs.mongo, (err, test_db) ->
    test_db.collection 'users', (err, users) ->
      async.forEachSeries state.Users, (user, cb) ->
        users.insert user, cb
      , () ->
        test_db.close () ->
          apiserver.start done

afterEach (done) ->
  redis_client = redis.createClient()
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      test_db.dropDatabase () ->
        test_db.close () ->
          apiserver.stop () ->
            done()

describe 'Our User system', ->

  it 'should create an anonymous user when cookie does not exist', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.header['x-powered-by'].should.equal 'Express'
          res.type.should.equal 'application/json'
          should.exist res.header['set-cookie']
          oldUserId = res.body._id
          done()

  it 'should load the existing anonymous user on subsequent accesses', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.header['x-powered-by'].should.equal 'Express'
          res.type.should.equal 'application/json'
          should.exist res.header['set-cookie']
          userId = res.body._id
          process.nextTick () ->
            user.get("http://localhost:#{configs.port}/users/me")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  should.not.exist res.header['set-cookie']
                  res.body._id.should.equal userId
                  done()

  it 'should create a new session after the old one expires', (done) ->
    user = sa.agent()
    oldExpires = apiserver.configs.expires
    apiserver.configs.expires = 150
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          setTimeout ->
            user.get("http://localhost:#{configs.port}/users/me")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  should.exist res.header['set-cookie']
                  apiserver.configs.expires = oldExpires
                  res.body._id.should.not.equal userId
                  done()
          , 300

  it 'should be able to access user info through canonical path', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          created = res.body.created
          process.nextTick ->
            user.get("http://localhost:#{configs.port}/users/#{userId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body._id.should.equal userId
                  res.body.created.should.equal created
                  done()

  it 'should not allow a user access to another users private data', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userId = res.body._id
          user2 = sa.agent()
          user2.get("http://localhost:#{configs.port}/users/#{userId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 403
                done()

  it 'should destroy the anonymous user if they logout of the system', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          process.nextTick ->
            user.get("http://localhost:#{configs.port}/logout")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  process.nextTick ->
                    user.get("http://localhost:#{configs.port}/users/me")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body._id.should.not.equal userId
                          done()

  it 'should allow the anonymous user to delete his own account', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          process.nextTick ->
            user.del("http://localhost:#{configs.port}/users/#{userId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  process.nextTick ->
                    user.get("http://localhost:#{configs.port}/users/me")
                      .end (err, res) ->
                        if err then done err else
                          res.body._id.should.not.equal userId
                          done()

  it 'should not allow another user to delete someone elses account', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          user2 = sa.agent()
          user2.get("http://localhost:#{configs.port}/users/me")
            .end (err, res) ->
              if err then done err else
                user2.del("http://localhost:#{configs.port}/users/#{userId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      done()

  it 'should be able to login an existing user with valid username and password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/users/auth")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should transistion an anonymous user into a registered one with provided email', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/users/auth")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          should.exist res.header['set-cookie']
          res.should.have.status 200
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should remove the current anonymous user when signing into registered one', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          oldSalt = apiserver.configs.passwordSalt
          delete apiserver.configs.passwordSalt
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/users/auth")
              .set('Content-Type', 'application/json')
              .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
              .end (err, res) ->
                if err then done err else
                  should.exist res.header['set-cookie']
                  res.should.have.status 200
                  apiserver.configs.passwordSalt = oldSalt
                  process.nextTick ->
                    user.get("http://localhost:#{configs.port}/users/#{userId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 404
                          should.not.exist res.header['set-cookie']
                          done()

  it 'should filter out the users password field on return data', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          should.not.exist res.body.password
          done()

  it 'should hash a users password when registering a user with hashing is enabled', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
            password: 'this_should_be_hashed'
          userId = res.body._id
          process.nextTick () ->
            user.put("http://localhost:#{configs.port}/users/me")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body._id.should.equal userId
                  res.body.email.should.equal userEmail
                  res.body.password.should.not.equal 'this_should_be_hashed'
                  done()

  it 'should allow a user to login with their correct password with hashing enabled', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
            password: 'this_should_be_hashed'
          userId = res.body._id
          process.nextTick () ->
            user.put("http://localhost:#{configs.port}/users/me")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body._id.should.equal userId
                  res.body.email.should.equal userEmail
                  user2 = sa.agent()
                  user2.post("http://localhost:#{configs.port}/users/auth")
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify({ username: 'another_test@user.com', password: 'this_should_be_hashed' }))
                    .end (err, res) ->
                      if err then done err else
                        should.exist res.header['set-cookie']
                        res.should.have.status 200
                        res.body._id.should.equal userId
                        done()