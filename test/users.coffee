async = require 'async'
configs = require 'configs'
mongodb = require 'mongodb'
should = require 'should'
sa = require 'superagent'
state = require './state'

apiserver = require '../lib'
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
  db.connect configs.mongo, (err, test_db) ->
    test_db.dropDatabase () ->
      test_db.close () ->
        apiserver.stop done

describe 'Our User system', ->

  user1 = sa.agent()
  user2 = sa.agent()
  user3 = sa.agent()
  user = sa.agent()
  userId = ''
  userId3 = ''
  oldUserId = ''
  newUserId = ''
  oldSalt = null;

  it 'should create an anonymous user when cookie does not exist', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.header['x-powered-by'].should.equal 'Express'
          res.type.should.equal 'application/json'
          should.exist res.header['set-cookie']
          oldUserId = res.body._id
          done()

  it 'should load the existing anonymous user on subsequent accesses', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          should.not.exist res.header['set-cookie']
          res.body._id.should.equal oldUserId
          done()

  it 'should create a new session after the old one expires', (done) ->
    oldExpires = app.configs.expires
    app.configs.expires = 50
    setTimeout ->
      user1.get("http://localhost:#{configs.port}/api/users/me")
        .end (err, res) ->
          if err then done err else
            should.exist res.header['set-cookie']
            app.configs.expires = oldExpires
            done()
    , 100

  it 'should give me a new anonymous user with the new session', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          res.body._id.should.not.equal oldUserId
          newUserId = res.body._id
          done()

  it 'should let me access the user info through normal user paths', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/#{newUserId}")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body._id.should.equal newUserId
          done()

  it 'should not allow a user access to another users private data', (done) ->
    user2.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          userId = res.body._id
          user2.get("http://localhost:#{configs.port}/api/users/#{newUserId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 403
                done()

  it 'should destroy the anonymous user if they logout of the system', (done) ->
    user1.get("http://localhost:#{configs.port}/api/logout")
      .end (err, res) ->
        if err then done err else
          user1.get("http://localhost:#{configs.port}/api/users/me")
            .end (err, res) ->
              if err then done err else
                res.body._id.should.not.equal newUserId
                done()

  it 'should allow the anonymous user to delete his own account', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          userId = res.body._id
          user1.del("http://localhost:#{configs.port}/api/users/#{userId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                user1.get("http://localhost:#{configs.port}/api/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.body._id.should.not.equal userId
                      done()

  it 'should not allow another user to delete this someone elses account', (done) ->
    user1.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          userId = res.body._id
          user2.get("http://localhost:#{configs.port}/api/users/me")
            .end (err, res) ->
              if err then done err else
                user2.del("http://localhost:#{configs.port}/api/users/#{userId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      done()


  it 'should create a new anonymous user on demand', (done) ->
    user3.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          should.exist res.headers['set-cookie']
          userId3 = res.body._id
          done()

  it 'should transistion an anonymous user into a registered one with provided username', (done) ->
    user3.post("http://localhost:#{configs.port}/api/users/auth")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          done()

  it 'should transistion an anonymous user into a registered one with provided email', (done) ->
    user6 = sa.agent()
    user6.post("http://localhost:#{configs.port}/api/users/auth")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          should.exist res.header['set-cookie']
          res.should.have.status 200
          done()

  it 'should remove the current anonymous user when signing into registered one', (done) ->
    user3.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          should.not.exist res.header['set-cookie']
          res.body._id.should.not.equal userId3
          done()

  it 'should filter out the users password field on return data', (done) ->
    user3.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          should.not.exist res.body.password
          done()

  it 'should hash a users password when registering a user with hashing is enabled', (done) ->
    oldSalt = app.configs.passwordSalt
    app.configs.passwordSalt = 'a_test_salt';
    user4 = new sa.agent()
    user4.get("http://localhost:#{configs.port}/api/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
            password: 'this_should_be_hashed'
            confirmPassword: 'this_should_be_hashed'
            inviteCode: 'abc123'
          userId = res.body._id
          process.nextTick () ->
            user4.put("http://localhost:#{configs.port}/api/users/me")
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
    user5 = new sa.agent()
    user5.post("http://localhost:#{configs.port}/api/users/auth")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'another_test@user.com', password: 'this_should_be_hashed' }))
      .end (err, res) ->
        if err then done err else
          should.exist res.header['set-cookie']
          res.should.have.status 200
          res.body._id.should.equal userId
          app.configs.passwordSalt = oldSalt
          done()

  it 'should allow a user to query whether a user with a given email address exists', (done) ->
    email = encodeURIComponent 'email4@doesnot.com'
    user3.get("http://localhost:#{configs.port}/api/users?email=#{email}")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          email = encodeURIComponent 'email6@doesnot.com'
          user3.get("http://localhost:#{configs.port}/api/users?email=#{email}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 404
                done()

  it 'should allow a user to query whether a user with a given username exists', (done) ->
    username = 'matchusername'
    user3.get("http://localhost:#{configs.port}/api/users?username=#{username}")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          username = 'donotmatchusername'
          user3.get("http://localhost:#{configs.port}/api/users?username=#{username}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 404
                done()

  it 'should not allow a user to query without username or email query parameters', (done) ->
    user3.get("http://localhost:#{configs.port}/api/users")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 400
          done()
