apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'runnables api', ->

  it 'should be able to create a new default ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          res.body.should.have.property 'framework', 'node.js'
          res.body.should.have.property '_id'
          if apiserver.configs.shortProjectIds
            res.body._id.length.should.equal 16
          else
            res.body._id.length.should.equal 24
          done()

  it 'should be able to create a new node.js ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          res.body.should.have.property 'framework', 'node.js'
          done()

  it 'should be able to retrieve a ::runnable by its id', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.should.have.property 'body'
                res.body.should.have.property '_id', runnableId
                res.body.should.have.property 'framework', 'node.js'
                done()

  it 'should be able to retrieve a ::runnable with inline comments', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick ->
            oldSalt = apiserver.configs.passwordSalt
            delete apiserver.configs.passwordSalt
            user.post("http://localhost:#{configs.port}/login")
              .set('Content-Type', 'application/json')
              .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/comments")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(text: "this is a comment"))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          res.should.have.property 'body'
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}?comments=true")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.should.have.property 'body'
                                res.body.should.have.property '_id', runnableId
                                res.body.should.have.property 'framework', 'node.js'
                                res.body.should.have.property 'comments'
                                res.body.comments.should.be.a.array
                                res.body.comments.length.should.be.above 0
                                res.body.comments[0].should.have.property 'gravitar'
                                res.body.comments[0].should.have.property 'username', 'matchusername5'
                                apiserver.configs.passwordSalt = oldSalt
                                done()

  it 'should return bad request if the ::runnable id is invalid', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/runnables/12345")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 500
          res.should.have.property 'body'
          res.body.should.have.property 'message', 'error looking up runnable'
          done()

  it 'should allow an owner to delete a ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick ->
            user.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.should.have.property 'body'
                  res.body.should.have.property 'message', 'runnable deleted'
                  done()

  it 'should deny a non-owner from deleting a ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick ->
            user2 = sa.agent()
            user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.should.have.property 'body'
                  res.body.should.have.property 'message', 'permission denied'
                  done()

  it 'should allow an admin to delete any ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick ->
            user2 = sa.agent()
            oldSalt = apiserver.configs.passwordSalt
            delete apiserver.configs.passwordSalt
            data = JSON.stringify
              email: 'test4@testing.com'
              password: 'testing'
            user2.post("http://localhost:#{configs.port}/login")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  process.nextTick ->
                    user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.should.have.property 'body'
                          res.body.should.have.property 'message', 'runnable deleted'
                          apiserver.configs.passwordSalt = oldSalt
                          done()

  it 'should return not found if a ::runnable cannot be found at a given id', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
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

  it 'should report error if the ::runnable framework does not exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=notfound")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 403
          res.body.should.have.property 'message', 'framework does not exist'
          done()

  it 'should be possible to list all ::runnable owned by a given user', (done) ->
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
            user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.should.have.property 'body'
                  projectId = res.body._id
                  user.get("http://localhost:#{configs.port}/runnables")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        res.body[0]._id.should.equal projectId
                        apiserver.configs.passwordSalt = oldSalt
                        done()

  it 'should be possible to list all ::runnables which are published', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/runnables?published=true")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.be.a.array
          res.body.forEach (elem) ->
            elem.tags.should.be.a.array
            elem.tags.length.should.be.above 0
          done()

  it 'should be possible to list all ::runnables which belong to a channel', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/runnables?channel=facebook")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.be.a.array
          res.body.forEach (elem) ->
            elem.tags.should.be.a.array
            elem.tags.length.should.be.above 0
            elem.tags.should.include 'facebook'
          done()

  it 'should be possible to check the ::running status of a stopped runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.body.should.have.property 'running', false
          runnableId = res.body._id
          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.have.property 'running', false
                done()

  it 'should be able to start a runnable'

  it 'should be possible to check the ::running status of a started runnable'
