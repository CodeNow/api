apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'
should = require 'should'

describe 'user api', ->

  it 'should create an anonymous user when cookie does not exist', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.header['x-powered-by'].should.equal 'Express'
          res.type.should.equal 'application/json'
          should.exist res.header['set-cookie']
          done()

  it 'should return error when user id is not a valid mongo objectid', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/1235")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 500
          should.exist res.body.message
          res.body.message.should.equal 'error looking up user'
          done()

  it 'should return user not found when user id is not a valid mongo objectid', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/51b2347626201e421a000002")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 404
          should.exist res.body.message
          res.body.message.should.equal 'user not found'
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
    oldExpires = apiserver.configs.cookieExpires
    apiserver.configs.cookieExpires = 250
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
                  apiserver.configs.cookieExpires = oldExpires
                  res.body._id.should.not.equal userId
                  done()
          , 500

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
                  should.exist res.body.message
                  res.body.message.should.equal 'user logged out'
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

  it 'should be able to ::login an existing user with valid username and password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should return an error when we ::login with a username that doesnt exist', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'doesntexit', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 404
          should.exist res.body
          res.body.message.should.equal 'user not found'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should transistion an anonymous user into a registered one with provided email', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          should.exist res.header['set-cookie']
          res.should.have.status 200
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should include a ::gravitar url in user model', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'email4@doesnot.com', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.have.property 'gravitar', 'http://www.gravatar.com/avatar/c7f9034f0263d811384e9b3f09099779'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should remove the current anonymous user when we ::login to a registered one', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          oldSalt = apiserver.configs.passwordSalt
          delete apiserver.configs.passwordSalt
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/login")
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
    userEmail = 'another_test@user.com'
    data = JSON.stringify
      email: userEmail
      username: userEmail
      password: 'this_should_be_hashed'
    user.put("http://localhost:#{configs.port}/users/me")
      .set('Content-Type', 'application/json')
      .send(data)
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.email.should.equal userEmail
          res.body.password.should.not.equal 'this_should_be_hashed'
          user.get("http://localhost:#{configs.port}/users/me")
            .end (err, res) ->
              if err then done err else
                should.not.exist res.body.password
                done()

  it 'should store a password as plaintext when ::passhashing is disabled', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    userEmail = 'another_test@user.com'
    data = JSON.stringify
      email: userEmail
      username: userEmail
      password: 'this_should_be_hashed'
    user.put("http://localhost:#{configs.port}/users/me")
      .set('Content-Type', 'application/json')
      .send(data)
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.email.should.equal userEmail
          res.body.password.should.equal 'this_should_be_hashed'
          user.get("http://localhost:#{configs.port}/users/me")
            .end (err, res) ->
              if err then done err else
                should.not.exist res.body.password
                apiserver.configs.passwordSalt = oldSalt
                done()

  it 'should not allow a user to ::login with an invalid password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'notpassword' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 403
          should.exist res.body.message
          res.body.message.should.equal 'invalid password'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow a user to ::login with an invalid password with hashing enabled', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            password: 'mypassword'
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
                  res.body.password.should.not.equal 'mypassword'
                  user2 = sa.agent()
                  user2.post("http://localhost:#{configs.port}/login")
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify({ email: 'another_test@user.com', password: 'notmypassword' }))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        should.exist res.body.message
                        res.body.message.should.equal 'invalid password'
                        done()

  it 'should hash a users password when we ::register a user with ::passhashing is enabled', (done) ->
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

  it 'should not allow a user to double register', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
            password: 'mypassword'
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
                  user.put("http://localhost:#{configs.port}/users/me")
                    .set('Content-Type', 'application/json')
                    .send(data)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        should.exist res.body.message
                        res.body.message.should.equal 'you are already registered'
                        done()

  it 'should not allow a user to ::register without a password', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
          userId = res.body._id
          process.nextTick () ->
            user.put("http://localhost:#{configs.port}/users/me")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  should.exist res.body.message
                  res.body.message.should.equal 'must provide a password to user in the future'
                  done()

  it 'should not allow a user to ::register without an email address', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            username: userEmail
            password: 'mypassword'
          userId = res.body._id
          process.nextTick () ->
            user.put("http://localhost:#{configs.port}/users/me")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  should.exist res.body.message
                  res.body.message.should.equal 'must provide an email to register with'
                  done()

  it 'should not allow a user to ::login without a username or password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 400
          should.exist res.body.message
          res.body.message.should.equal 'username or email required'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow a user to ::login without a password', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 400
          should.exist res.body.message
          res.body.message.should.equal 'password required'
          apiserver.configs.passwordSalt = oldSalt
          done()

  it 'should not allow us to ::register a user that already exists', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        if err then done err else
          userEmail = 'another_test@user.com'
          data = JSON.stringify
            email: userEmail
            username: userEmail
            password: 'mypassword'
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
                  user2.put("http://localhost:#{configs.port}/users/me")
                    .set('Content-Type', 'application/json')
                    .send(data)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        should.exist res.body.message
                        res.body.message.should.equal 'user already exists'
                        done()

  it 'should not destroy the user when ::logout of a registered users session', (done) ->
    user = sa.agent()
    data = JSON.stringify
      email: 'my@email.com'
      password: 'password'
    user.put("http://localhost:#{configs.port}/users/me")
      .set('Content-Type', 'application/json')
      .send(data)
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.email.should.equal 'my@email.com'
          userId = res.body._id
          process.nextTick ->
            user.get("http://localhost:#{configs.port}/logout")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  should.exist res.body.message
                  res.body.message.should.equal 'user logged out'
                  process.nextTick ->
                    user2 = sa.agent()
                    user2.post("http://localhost:#{configs.port}/login")
                      .set('Content-Type', 'application/json')
                      .send(JSON.stringify({ email: 'my@email.com', password: 'password' }))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body._id.should.equal userId
                          done()

  it 'should allow a logged in user to ::switch to another logged in user', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          userId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/login")
              .set('Content-Type', 'application/json')
              .send(JSON.stringify({ email: 'test4@testing.com', password: 'testing' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body._id.should.not.equal userId
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/login")
                      .set('Content-Type', 'application/json')
                      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body._id.should.equal userId
                          apiserver.configs.passwordSalt = oldSalt
                          done()

  it 'should allow a user to ::login with their correct password with hashing enabled', (done) ->
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
                  user2.post("http://localhost:#{configs.port}/login")
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify({ username: 'another_test@user.com', password: 'this_should_be_hashed' }))
                    .end (err, res) ->
                      if err then done err else
                        should.exist res.header['set-cookie']
                        res.should.have.status 200
                        res.body._id.should.equal userId
                        done()