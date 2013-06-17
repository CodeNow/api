apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'voting api', ->

  it 'should not allow a user to ::vote without specifying runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( {  } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'must include runnable to vote on'
                  done()

  it 'should not allow a user to ::vote for their own ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( { runnable: runnableId } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.should.have.property 'message', 'cannot vote for own runnables'
                  done()

  it 'should allow a user to ::vote for a ::runnable they do not own', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user2 = sa.agent()
            user2.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( { runnable: runnableId } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'runnable', runnableId
                  done()

  it 'should not allow a user to ::vote twice for the same ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user2 = sa.agent()
            user2.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( { runnable: runnableId } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'runnable', runnableId
                  process.nextTick ->
                    user2.post("http://localhost:#{configs.port}/users/me/votes")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify( { runnable: runnableId } ))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          res.body.should.have.property 'message', 'cannot vote on runnable more than once'
                          done()

  it 'should increase the ::vote count of a ::runnable after the vote is applied', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user2 = sa.agent()
            user2.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( { runnable: runnableId } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'runnable', runnableId
                  user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/votes")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'count', 1
                        done()

  it 'should decrease the ::vote count of a ::runnable after a vote is removed', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          res.should.have.property 'body'
          runnableId = res.body._id
          process.nextTick () ->
            user2 = sa.agent()
            user2.post("http://localhost:#{configs.port}/users/me/votes")
              .set('content-type', 'application/json')
              .send(JSON.stringify( { runnable: runnableId } ))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'runnable', runnableId
                  voteId = res.body._id
                  user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/votes")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'count', 1
                        user2.del("http://localhost:#{configs.port}/users/me/votes/#{voteId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'message', 'removed vote'
                              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/votes")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property 'count', 0
                                    done()