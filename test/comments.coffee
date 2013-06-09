apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'comments api', ->

  it 'should be able to ::comment on a runnable as registered user', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        process.nextTick ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                userId = res.body.owner
                runnableId = res.body._id
                commentText = 'this is a comment'
                process.nextTick ->
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(text: commentText))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.should.have.property 'body'
                        res.body.should.have.property 'user', userId
                        res.body.should.have.property 'text', commentText
                        res.body.should.have.property '_id'
                        apiserver.configs.passwordSalt = oldSalt
                        done()

  it 'should not allow ::comments by anonymous user', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          userId = res.body.owner
          runnableId = res.body._id
          commentText = 'this is a comment'
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
              .set('content-type', 'application/json')
              .send(JSON.stringify(text: commentText))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.should.have.property 'body'
                  res.body.should.have.property 'message', 'permission denied'
                  done()

  it 'should report error if user posts a ::comment without a text field', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          userId = res.body.owner
          runnableId = res.body._id
          commentText = 'this is a comment'
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
              .set('content-type', 'application/json')
              .send(JSON.stringify(nottext: commentText))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.should.have.property 'body'
                  res.body.should.have.property 'message', 'comment must include a text field'
                  done()

  it 'should be able to list all ::comments associated with a runnable', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        process.nextTick ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                userId = res.body.owner
                runnableId = res.body._id
                commentText = 'this is a comment'
                process.nextTick ->
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(text: commentText))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.should.have.property 'body'
                        res.body.should.have.property 'user', userId
                        res.body.should.have.property 'text', commentText
                        user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.should.have.property 'body'
                              res.body.should.be.a.array
                              res.body.length.should.equal 1
                              res.body[0].text.should.equal commentText
                              res.body[0].user.should.equal userId
                              apiserver.configs.passwordSalt = oldSalt
                              done()

  it 'should be able to list all ::comments associated with a runnable with user lookup', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userId = res.body.owner
                  runnableId = res.body._id
                  commentText = 'this is a comment'
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(text: commentText))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          res.should.have.property 'body'
                          res.body.should.have.property 'user', userId
                          res.body.should.have.property 'text', commentText
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/comments?users=true")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.should.have.property 'body'
                                res.body.should.be.a.array
                                res.body.length.should.equal 1
                                res.body[0].should.have.property 'text', commentText
                                res.body[0].should.have.property 'gravitar', 'http://www.gravatar.com/avatar/b4da5cb470f26964c933b3d6d8b0a184'
                                apiserver.configs.passwordSalt = oldSalt
                                done()

  it 'should be able to delete your own ::comment on a runnable', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        process.nextTick ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                userId = res.body.owner
                runnableId = res.body._id
                commentText = 'this is a comment'
                process.nextTick ->
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(text: commentText))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.should.have.property 'body'
                        res.body.should.have.property 'user', userId
                        res.body.should.have.property 'text', commentText
                        res.body.should.have.property '_id'
                        commentId = res.body._id
                        user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/comments/#{commentId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'message', 'comment deleted'
                              apiserver.configs.passwordSalt = oldSalt
                              done()

  it 'should not be able to delete others ::comments on a runnable', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        process.nextTick ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                userId = res.body.owner
                runnableId = res.body._id
                commentText = 'this is a comment'
                process.nextTick ->
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(text: commentText))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.should.have.property 'body'
                        res.body.should.have.property 'user', userId
                        res.body.should.have.property 'text', commentText
                        res.body.should.have.property '_id'
                        commentId = res.body._id
                        user2 = sa.agent()
                        user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}/comments/#{commentId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'permission denied'
                              apiserver.configs.passwordSalt = oldSalt
                              done()

  it 'should allow admins to delete any ::comments on a runnable', (done) ->
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        process.nextTick ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 201
                userId = res.body.owner
                runnableId = res.body._id
                commentText = 'this is a comment'
                process.nextTick ->
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(text: commentText))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        commentId = res.body._id
                        user2 = sa.agent()
                        user2.post("http://localhost:#{configs.port}/login")
                          .set('Content-Type', 'application/json')
                          .send(JSON.stringify({ email: 'test4@testing.com', password: 'testing' }))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              process.nextTick ->
                                user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}/comments/#{commentId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'message', 'comment deleted'
                                      apiserver.configs.passwordSalt = oldSalt
                                      done()