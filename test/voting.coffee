apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'voting api', ->

  it 'should not allow a user to ::vote without specifying runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?from=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/votes")
                .set('content-type', 'application/json')
                .send(JSON.stringify( {  } ))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 400
                    res.body.should.have.property 'message', 'must include runnable to vote on'
                    done()

  it 'should not allow a user to ::vote for their own ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?from=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/users/me/votes")
                .set('content-type', 'application/json')
                .send(JSON.stringify( { runnable: runnableId } ))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 403
                    res.body.should.have.property 'message', 'cannot vote for own runnables'
                    done()

  it 'should allow a user to ::vote for a ::runnable they do not own', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables?from=node.js")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
                  user2.post("http://localhost:#{configs.port}/users/me/votes")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify( { runnable: runnableId } ))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.have.property '_id'
                        res.body.should.have.property 'runnable', runnableId
                        done()

  it 'should allow a user to retrieve a list of their ::votes', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
                  user2.post("http://localhost:#{configs.port}/users/me/votes")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify( { runnable: runnableId } ))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.have.property '_id'
                        res.body.should.have.property 'runnable', runnableId
                        user2.get("http://localhost:#{configs.port}/users/me/votes")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body.length.should.equal 1
                            res.body[0].should.have.property 'runnable', runnableId
                            done()


  it 'should not allow a user to ::vote twice for the same ::runnable', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
                  user2.post("http://localhost:#{configs.port}/users/me/votes")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify( { runnable: runnableId } ))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.have.property '_id'
                        res.body.should.have.property 'runnable', runnableId
                        user2.post("http://localhost:#{configs.port}/users/me/votes")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify( { runnable: runnableId } ))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'cannot vote on runnable more than once'
                              done()

  it 'should increase the ::vote count of a ::runnable after the vote is applied', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
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
    helpers.authedUser (err, user) ->
      if err then done err else
        user.post("http://localhost:#{configs.port}/runnables")
          .end (err, res) ->
            if err then done err else
              res.should.have.status 201
              res.should.have.property 'body'
              runnableId = res.body._id
              helpers.authedUser (err, user2) ->
                if err then done err else
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

  it 'should be able to list all ::runnables in descending order of ::votes', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            runnables = [ ]
            async.whilst () ->
              runnables.length < 5
            , (cb) ->
              user.post("http://localhost:#{configs.port}/runnables?from=node.js")
                .end (err, res) ->
                  if err then cb err else
                    res.should.have.status 201
                    res.body.should.have.property '_id'
                    runnables.push res.body._id
                    cb()
            , (err) ->
              if err then done err else
                helpers.authedUser (err, user2) ->
                  if err then done err else
                    voted = [ ]
                    user2.get("http://localhost:#{configs.port}/users/me")
                      .end (err, res) ->
                        index = 0
                        async.eachSeries runnables, (runnableId, cb) ->
                          if index%2 isnt 0
                            index++
                            cb()
                          else
                            voted.push runnableId
                            index++
                            user2.post("http://localhost:#{configs.port}/users/me/votes")
                              .set('content-type', 'application/json')
                              .send(JSON.stringify( { runnable: runnableId } ))
                              .end (err, res) ->
                                if err then cb err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  res.body.should.have.property 'runnable', runnableId
                                  cb()
                        , (err) ->
                          if err then done err else
                            user.get("http://localhost:#{configs.port}/runnables?sort=votes")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.should.have.property 'body'
                                  res.body.should.be.a.array
                                  res.body.length.should.equal 8
                                  voted.should.include res.body[0]._id
                                  voted.should.include res.body[1]._id
                                  voted.should.include res.body[2]._id
                                  res.body[0].should.have.property 'votes', 1
                                  res.body[1].should.have.property 'votes', 1
                                  res.body[2].should.have.property 'votes', 1
                                  res.body[3].should.have.property 'votes', 0
                                  res.body[4].should.have.property 'votes', 0
                                  res.body[5].should.have.property 'votes', 0
                                  res.body[6].should.have.property 'votes', 0
                                  res.body[7].should.have.property 'votes', 0
                                  done()

  it 'should be able to list all ::runnables in descending order of ::votes after runnable is deleted', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            runnables = [ ]
            async.whilst () ->
              runnables.length < 5
            , (cb) ->
              user.post("http://localhost:#{configs.port}/runnables?from=node.js")
                .end (err, res) ->
                  if err then cb err else
                    res.should.have.status 201
                    res.body.should.have.property '_id'
                    runnables.push res.body._id
                    cb()
            , (err) ->
              if err then done err else
                helpers.authedUser (err, user2) ->
                  if err then done err else
                    voted = [ ]
                    user2.get("http://localhost:#{configs.port}/users/me")
                      .end (err, res) ->
                        index = 0
                        async.eachSeries runnables, (runnableId, cb) ->
                          if index%2 isnt 0
                            index++
                            cb()
                          else
                            voted.push runnableId
                            index++
                            user2.post("http://localhost:#{configs.port}/users/me/votes")
                              .set('content-type', 'application/json')
                              .send(JSON.stringify( { runnable: runnableId } ))
                              .end (err, res) ->
                                if err then cb err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  res.body.should.have.property 'runnable', runnableId
                                  cb()
                        , (err) ->
                          if err then done err else
                            user.del("http://localhost:#{configs.port}/runnables/#{voted[0]._id}")
                              .end (err, res) ->
                                if err then done err else
                                  user.get("http://localhost:#{configs.port}/runnables?sort=votes")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.should.have.property 'body'
                                        res.body.should.be.a.array
                                        res.body.length.should.equal 8
                                        voted.should.include res.body[0]._id
                                        voted.should.include res.body[1]._id
                                        res.body[0].should.have.property 'votes', 1
                                        res.body[1].should.have.property 'votes', 1
                                        res.body[3].should.have.property 'votes', 0
                                        res.body[4].should.have.property 'votes', 0
                                        res.body[5].should.have.property 'votes', 0
                                        res.body[6].should.have.property 'votes', 0
                                        res.body[7].should.have.property 'votes', 0
                                        done()

  it 'should be able to list channel ::runnables in descending order of ::votes', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        token = res.body.access_token
        user.post("http://localhost:#{configs.port}/runnables")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              res.body.should.have.property '_id'
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                .set('runnable-token', token)
                .set('content-type', 'application/json')
                .send(JSON.stringify(name: 'twitter'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      user.post("http://localhost:#{configs.port}/runnables")
                        .set('runnable-token', token)
                        .end (err, res) ->
                          if err then cb err else
                            res.should.have.status 201
                            res.body.should.have.property '_id'
                            runnableId = res.body._id
                            runnables.push runnableId
                            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                              .set('runnable-token', token)
                              .set('content-type', 'application/json')
                              .send(JSON.stringify(name: 'facebook'))
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  cb()
                    , (err) ->
                      if err then done err else
                        helpers.authedUser (err, user2) ->
                          if err then done err else
                            voted = [ ]
                            user2.get("http://localhost:#{configs.port}/users/me")
                              .end (err, res) ->
                                process.nextTick ->
                                  index = 0
                                  async.eachSeries runnables, (runnableId, cb) ->
                                    if index%2 isnt 0
                                      index++
                                      cb()
                                    else
                                      voted.push runnableId
                                      index++
                                      user2.post("http://localhost:#{configs.port}/users/me/votes")
                                        .set('content-type', 'application/json')
                                        .send(JSON.stringify( { runnable: runnableId } ))
                                        .end (err, res) ->
                                          if err then cb err else
                                            res.should.have.status 201
                                            res.body.should.have.property '_id'
                                            res.body.should.have.property 'runnable', runnableId
                                            cb()
                                  , (err) ->
                                    if err then done err else
                                      user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes")
                                        .set('runnable-token', token)
                                        .end (err, res) ->
                                          if err then done err else
                                            res.should.have.status 200
                                            res.should.have.property 'body'
                                            res.body.should.be.a.array
                                            res.body.length.should.equal 6
                                            voted.should.include res.body[0]._id
                                            voted.should.include res.body[1]._id
                                            voted.should.include res.body[2]._id
                                            res.body[0].should.have.property 'votes', 1
                                            res.body[1].should.have.property 'votes', 1
                                            res.body[2].should.have.property 'votes', 1
                                            res.body[3].should.have.property 'votes', 0
                                            res.body[4].should.have.property 'votes', 0
                                            res.body[5].should.have.property 'votes', 0
                                            apiserver.configs.passwordSalt = oldSalt
                                            done()

  it 'should be able to list users ::runnables in descending order of ::votes', (done) ->
    helpers.authedUser (err, user2) ->
      if err then done err else
        user2.get("http://localhost:#{configs.port}/users/me")
          .end (err, res) ->
            user2.post("http://localhost:#{configs.port}/runnables")
              .end (err, res) ->
                if err then cb err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  runnableId = res.body._id
                  helpers.authedUser (err, user) ->
                    if err then done err else
                      user.get("http://localhost:#{configs.port}/users/me")
                        .end (err, res) ->
                          res.should.have.status 200
                          owner = res.body._id
                          runnables = [ ]
                          async.whilst () ->
                            runnables.length < 5
                          , (cb) ->
                            user.post("http://localhost:#{configs.port}/runnables")
                              .end (err, res) ->
                                if err then cb err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  runnableId = res.body._id
                                  runnables.push runnableId
                                  cb()
                          , (err) ->
                            if err then done err else
                              voted = [ ]
                              index = 0
                              async.eachSeries runnables, (runnableId, cb) ->
                                if index%2 isnt 0
                                  index++
                                  cb()
                                else
                                  voted.push runnableId
                                  index++
                                  user2.post("http://localhost:#{configs.port}/users/me/votes")
                                    .set('content-type', 'application/json')
                                    .send(JSON.stringify( { runnable: runnableId } ))
                                    .end (err, res) ->
                                      if err then cb err else
                                        res.should.have.status 201
                                        res.body.should.have.property '_id'
                                        res.body.should.have.property 'runnable', runnableId
                                        cb()
                              , (err) ->
                                if err then done err else
                                  user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}&sort=votes")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.should.have.property 'body'
                                        res.body.should.be.a.array
                                        res.body.length.should.equal 5
                                        voted.should.include res.body[0]._id
                                        voted.should.include res.body[1]._id
                                        voted.should.include res.body[2]._id
                                        res.body[0].should.have.property 'votes', 1
                                        res.body[1].should.have.property 'votes', 1
                                        res.body[2].should.have.property 'votes', 1
                                        res.body[3].should.have.property 'votes', 0
                                        res.body[4].should.have.property 'votes', 0
                                        done()

  it 'should be able to list published ::runnables in descending order of ::votes', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        token = res.body.access_token
        user.post("http://localhost:#{configs.port}/runnables")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then cb err else
              res.should.have.status 201
              res.body.should.have.property '_id'
              runnableId = res.body._id
              user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                .set('runnable-token', token)
                .set('content-type', 'application/json')
                .send(JSON.stringify(name: 'twitter'))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      user.post("http://localhost:#{configs.port}/runnables")
                        .set('runnable-token', token)
                        .end (err, res) ->
                          if err then cb err else
                            res.should.have.status 201
                            res.body.should.have.property '_id'
                            runnableId = res.body._id
                            runnables.push runnableId
                            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                              .set('runnable-token', token)
                              .set('content-type', 'application/json')
                              .send(JSON.stringify(name: 'facebook'))
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  cb()
                    , (err) ->
                      if err then done err else
                        helpers.authedUser (err, user2) ->
                          if err then done err else
                            voted = [ ]
                            user2.get("http://localhost:#{configs.port}/users/me")
                              .end (err, res) ->
                                process.nextTick ->
                                  index = 0
                                  async.eachSeries runnables, (runnableId, cb) ->
                                    if index%2 isnt 0
                                      index++
                                      cb()
                                    else
                                      voted.push runnableId
                                      index++
                                      user2.post("http://localhost:#{configs.port}/users/me/votes")
                                        .set('content-type', 'application/json')
                                        .send(JSON.stringify( { runnable: runnableId } ))
                                        .end (err, res) ->
                                          if err then cb err else
                                            res.should.have.status 201
                                            res.body.should.have.property '_id'
                                            res.body.should.have.property 'runnable', runnableId
                                            cb()
                                  , (err) ->
                                    if err then done err else
                                      user.get("http://localhost:#{configs.port}/runnables?published=true&sort=votes")
                                        .set('runnable-token', token)
                                        .end (err, res) ->
                                          if err then done err else
                                            res.should.have.status 200
                                            res.should.have.property 'body'
                                            res.body.should.be.a.array
                                            res.body.length.should.equal 8
                                            voted.should.include res.body[0]._id
                                            voted.should.include res.body[1]._id
                                            voted.should.include res.body[2]._id
                                            res.body[0].should.have.property 'votes', 1
                                            res.body[1].should.have.property 'votes', 1
                                            res.body[2].should.have.property 'votes', 1
                                            res.body[3].should.have.property 'votes', 0
                                            res.body[4].should.have.property 'votes', 0
                                            res.body[5].should.have.property 'votes', 0
                                            res.body[6].should.have.property 'votes', 0
                                            apiserver.configs.passwordSalt = oldSalt
                                            done()