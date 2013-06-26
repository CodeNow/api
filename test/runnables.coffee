apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'runnables api', ->

  it 'should be able to create a new ::runnable from a default base', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    res.should.have.property 'body'
                    res.body.should.have.property 'container'
                    res.body.should.have.property '_id'
                    res.body.should.have.property 'parent', 'node.js'
                    res.body.should.have.property 'owner', userId
                    res.body.should.not.have.property 'published'
                    if apiserver.configs.shortProjectIds
                      res.body._id.length.should.equal 16
                    else
                      res.body._id.length.should.equal 24
                    runnableId = res.body._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          res.body[0].should.have.property 'name', 'server.js'
                          res.body[0].should.have.property 'default', true
                          done()

  it 'should be able to create a new ::runnable from a named base', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .set('content-type', 'application/json')
                .send(JSON.stringify(parent: 'node.js'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    res.should.have.property 'body'
                    res.body.should.have.property 'container'
                    res.body.should.have.property '_id'
                    res.body.should.have.property 'parent', 'node.js'
                    res.body.should.have.property 'owner', userId
                    res.body.should.not.have.property 'published'
                    if apiserver.configs.shortProjectIds
                      res.body._id.length.should.equal 16
                    else
                      res.body._id.length.should.equal 24
                    runnableId = res.body._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          res.body[0].should.have.property 'name', 'server.js'
                          res.body[0].should.have.property 'default', true
                          done()

  it 'should report error if the ::runnable provided named base does not exist', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .set('content-type', 'application/json')
          .send(JSON.stringify(parent: 'notfound'))
          .end (err, res) ->
            if err then done err else
              res.should.have.status 403
              res.body.should.have.property 'message', 'base does not exist'
              done()

  it 'should be able to query for an existing unsaved ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .set('content-type', 'application/json')
                .send(JSON.stringify(parent: 'node.js'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables?parent=node.js")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property '_id', runnableId
                          done()

  it 'should not be able to create a new ::runnable if an existing unsaved already exists', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .set('content-type', 'application/json')
                .send(JSON.stringify(parent: 'node.js'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    user.post("http://localhost:#{configs.port}/users/me/runnables")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(parent: 'node.js'))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          res.body.should.have.property 'message', 'already editing a project from this parent'
                          done()

  it 'should be able to discard/undo any unsaved changes made while editing a ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .set('content-type', 'application/json')
                .send(JSON.stringify(parent: 'node.js'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          res.body.should.have.property 'message', 'deleted runnable'
                          done()

  it 'should be able to save a ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    res.body.should.have.property 'container'
                    res.body.should.have.property 'owner', userId
                    user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                      .end (err) ->
                        if err then done err else
                          res.should.have.status 201
                          res.body.should.have.property '_id'
                          res.body.should.have.property 'image'
                          res.body.should.not.have.property 'container'
                          res.body.should.have.property 'parent', 'node.js'
                          res.body.have.property 'owner', userId
                          done()

  it 'should be able to update a previously saved ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    res.body.should.have.property 'container'
                    res.body.should.have.property 'owner', userId
                    user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                      .end (err) ->
                        if err then done err else
                          res.should.have.status 201
                          res.body.should.have.property '_id'
                          publishedId = res.body._id
                          res.body.should.have.property 'image'
                          res.body.should.not.have.property 'container'
                          res.body.should.have.property 'parent', 'node.js'
                          res.body.should.have.property 'owner', userId
                          user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(name: 'updated project name'))
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.have.property 'name', 'updated project name'
                                user.put("http://localhost:#{configs.port}/runnables/#{publishedId}?from=#{runnableId}")
                                  .end (err) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'name', 'updated project name'
                                      done()

  it 'should not be able to save a ::runnable you do not own', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                .end (err) ->
                  if err then done err else
                    res.should.have.status 201
                    publishedId = res.body._id
                    helpers.authedUser (err, user2) ->
                      if err then done err else
                        user2.post("http://localhost:#{configs.port}/users/me/runnables")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              runnableId2 = res.body._id
                              user2.put("http://localhost:#{configs.port}/runnables/#{publishedId}?from=#{runnableId2}")
                                .end (err) ->
                                  if err then done err else
                                    res.should.have.status 403
                                    res.body.should.have.property 'message', 'no permission to save'
                                    done()

  it 'should report error when saving/publishing a ::runnable that does not exist', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?from=51b2347626201e421a000002")
          .end (err) ->
            if err then done err else
              res.should.have.status 403
              res.body.should.have.property 'message', 'runnable does not exist'
              done()

  it 'should not be able to access files of published ::runnables', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                .end (err) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .res (err) ->
                        if err then done err else
                          res.should.have.status 404
                          done()

  it 'should be able to update an existing published ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              newRunnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{newRunnableId}")
                .end (err) ->
                  if err then done err else
                    res.should.have.status 201
                    res.body.should.have.property 'image'
                    res.body.should.not.have.property 'container'
                    runnableId = res.body._id
                    user.put("http://localhost:#{configs.port}/runnables/#{runnableId}?from=#{newRunnableId}")
                      .end (err) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'image'
                          res.body.should.not.have.property 'container'
                          done()

  it 'should be able to delete a published ::runnable that you own', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                .end (err) ->
                  if err then done err else
                    res.should.have.status 201
                    publishedRunnableId = res.body._id
                    user.del("http://localhost:#{configs.port}/runnables/#{publishedRunnableId}")
                      .end (err) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'message', 'runnable deleted'
                          done()

  it 'should create a ::runnable from an existing published one', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                .end (err) ->
                  if err then done err else
                    res.should.have.status 201
                    publishedId = res.body._id
                    user.post("http://localhost:#{configs.port}/users/me/runnables?base=#{publishedId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          done()

  it 'should be able to publish a ::runnable that is currently running', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              userId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/runnables")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnableId = res.body._id
                    res.body.should.have.property 'owner', userId
                    user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({ running: true }))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'running', true
                          user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 201
                                res.body.should.have.property 'parent', runnableId
                                res.body.should.have.property 'owner', userId
                                publishedRunnable = res.body._id
                                user.get("http://localhost:#{configs.port}/runnables/#{publishedRunnable}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.not.have.property 'parent'
                                      res.body.should.have.property 'owner', userId
                                      done()

  it 'should be able to retrieve a users ::runnable by its id', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/users/me/runnables?base=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.should.have.property 'body'
                    res.body.should.have.property '_id', runnableId
                    done()

  it 'should be able to retrieve a ::runnable with inline comments', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              oldSalt = apiserver.configs.passwordSalt
              delete apiserver.configs.passwordSalt
              user.post("http://localhost:#{configs.port}/token")
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    token = res.body.access_token
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                      .set('content-type', 'application/json')
                      .set('runnable-token', token)
                      .send(JSON.stringify(text: "this is a comment"))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          res.should.have.property 'body'
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}?comments=true")
                            .set('runnable-token', token)
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.should.have.property 'body'
                                res.body.should.have.property '_id', runnableId
                                res.body.should.have.property 'comments'
                                res.body.comments.should.be.a.array
                                res.body.comments.length.should.be.above 0
                                res.body.comments[0].should.have.property 'gravitar'
                                res.body.comments[0].should.have.property 'username', 'matchusername5'
                                apiserver.configs.passwordSalt = oldSalt
                                done()

  it 'should return bad request if the ::runnable id is invalid', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/runnables/12345")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 500
              res.should.have.property 'body'
              res.body.should.have.property 'message', 'error looking up runnable'
              done()

  it 'should allow an owner to delete a ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?base=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              user.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.should.have.property 'body'
                    res.body.should.have.property 'message', 'runnable deleted'
                    done()

  it 'should deny a non-owner from deleting a ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?base=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
                  user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.should.have.property 'body'
                        res.body.should.have.property 'message', 'permission denied'
                        done()

  it 'should allow an admin to delete any ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?base=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              if err then done err else
                user2 = sa.agent()
                oldSalt = apiserver.configs.passwordSalt
                delete apiserver.configs.passwordSalt
                data = JSON.stringify
                  email: 'test4@testing.com'
                  password: 'testing'
                user2.post("http://localhost:#{configs.port}/token")
                  .set('Content-Type', 'application/json')
                  .send(data)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      token = res.body.access_token
                      user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                        .set('runnable-token', token)
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.should.have.property 'body'
                            res.body.should.have.property 'message', 'runnable deleted'
                            apiserver.configs.passwordSalt = oldSalt
                            done()

  it 'should return not found if a ::runnable cannot be found at a given id', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?base=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              runnableId = res.body._id
              user.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.should.have.property 'body'
                    res.body.should.have.property 'message', 'runnable deleted'
                    user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 404
                          res.should.have.property 'body'
                          res.body.should.have.property 'message', 'runnable not found'
                          done()

  it 'should be possible to list all ::runnable owned by a given user', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          token = res.body.access_token
          user.post("http://localhost:#{configs.port}/runnables?base=node.js")
            .set('runnable-token', token)
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                res.should.have.property 'body'
                res.body.should.have.property 'owner'
                owner = res.body.owner
                projectId = res.body._id
                user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}")
                  .set('runnable-token', token)
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.be.a.array
                      res.body.length.should.equal 1
                      res.body[0]._id.should.equal projectId
                      apiserver.configs.passwordSalt = oldSalt
                      done()

  it 'should be possible to list all ::runnables which are published', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/runnables?published=true")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              res.body.should.be.a.array
              res.body.length.should.equal 2
              res.body.forEach (elem) ->
                elem.tags.should.be.a.array
                elem.tags.length.should.be.above 0
              done()

  it 'should be possible to list all ::runnables which belong to a channel', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/runnables?channel=facebook")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              res.body.should.be.a.array
              res.body.length.should.equal 1
              res.body.forEach (elem) ->
                elem.tags.should.be.a.array
                elem.tags.length.should.be.above 0
                elem.tags.should.includeEql { name: 'facebook', id: null }
              done()

  it 'should be possible to check the state of a stopped ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.body.should.have.property 'state'
              res.body.state.should.have.property 'running', false
              runnableId = res.body._id
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'state'
                    res.body.state.should.have.property 'running', false
                    done()

  it 'should be able to fasdfsafsd start a ::runnable from a stopped state', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.body.should.have.property 'state'
              res.body.state.should.have.property 'running', false
              runnableId = res.body._id
              user.put("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .set('content-type', 'application/json')
                .send(JSON.stringify({ running: true }))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'state'
                    res.body.state.should.have.property 'running', true
                    user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'state'
                          res.body.state.should.have.property 'running', true
                          done()

  it 'should be able to ::stop a ::runnable from a started state', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.body.should.have.property 'state'
              res.body.state.should.have.property 'running', false
              runnableId = res.body._id
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'state'
                    res.body.state.should.have.property 'running', false
                    user.put("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({ running: true }))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'state'
                          res.body.state.should.have.property 'running', true
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.have.property 'state'
                                res.body.state.should.have.property 'running', true
                                user.put("http://localhost:#{configs.port}/runnables/#{runnableId}")
                                  .set('content-type', 'application/json')
                                  .send(JSON.stringify({ running: false }))
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'state'
                                      res.body.state.should.have.property 'running', false
                                      user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                                        .end (err, res) ->
                                          if err then done err else
                                            res.should.have.status 200
                                            res.body.should.have.property 'state'
                                            res.body.state.should.have.property 'running', false
                                            done()

  it 'should create a new ::runnable in a stopped state', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.body.should.have.property 'state'
              res.body.state.should.have.property 'running', false
              runnableId = res.body._id
              setTimeout () ->
                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.have.property 'state'
                      res.body.state.should.have.property 'running', false
                      res.body.state.should.not.have.property 'web_url'
                      done()
              , 1000

  it 'should pass back a service url that the client can hit when a ::runnable is started', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.body.should.have.property 'state'
              res.body.state.should.have.property 'running', false
              runnableId = res.body._id
              user.put("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .set('content-type', 'application/json')
                .send(JSON.stringify({ running: true }))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'state'
                    res.body.state.should.have.property 'running', true
                    res.body.state.should.have.property 'web_url'
                    done()