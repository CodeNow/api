apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'pagination api', ->

  it 'should be able to ::paginate a users own runnable list', (done) ->
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
                    runnables.push res.body._id
                    cb()
            , (err) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.be.a.array
                      res.body.length.should.equal 5
                      elem = res.body[2]._id
                      user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}&page=2&limit=1")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body.length.should.equal 1
                            res.body[0]._id.should.equal elem
                            done()

  it 'should be able to ::paginate a users own runnable list sorted by votes', (done) ->
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
                    runnables.push res.body._id
                    runnableId = res.body._id
                    numVotes = 0
                    async.whilst () ->
                      numVotes < runnables.length
                    , (cb) ->
                      numVotes++
                      helpers.authedUser (err, user2) ->
                        if err then cb err else
                          user2.post("http://localhost:#{configs.port}/users/me/votes")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(runnable: runnableId))
                            .end (err, res) ->
                              if err then cb err else
                                res.should.have.status 201
                                cb()
                    , cb
            , (err) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}&sort=votes")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.be.a.array
                      res.body.length.should.equal 5
                      elem = res.body[2]._id
                      user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}&sort=votes&page=2&limit=1")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body.length.should.equal 1
                            res.body[0]._id.should.equal elem
                            done()

  it 'should be able to ::paginate all runnables', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        runnables = [ ]
        async.whilst () ->
          runnables.length < 5
        , (cb) ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 201
                res.body.should.have.property '_id'
                runnables.push res.body._id
                cb()
        , (err) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 8
                  elem = res.body[2]._id
                  user.get("http://localhost:#{configs.port}/runnables?page=2&limit=1")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        res.body[0]._id.should.equal elem
                        done()

  it 'should be able to ::paginate all runnables sorted by votes', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
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
                runnables.push res.body._id
                numVotes = 0
                async.whilst () ->
                  numVotes < runnables.length
                , (cb) ->
                  numVotes++
                  helpers.authedUser (err, user2) ->
                    if err then cb err else
                      user2.post("http://localhost:#{configs.port}/users/me/votes")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify(runnable: runnableId))
                        .end (err, res) ->
                          if err then cb err else
                            res.should.have.status 201
                            cb()
                , cb
        , (err) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?sort=votes")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 8
                  user.get("http://localhost:#{configs.port}/runnables?sort=votes&page=2&limit=1")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        done()

  it 'should have a default ::paginate of configs.defaultPageLimit when listing when', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        runnables = [ ]
        async.whilst () ->
          runnables.length < 30
        , (cb) ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 201
                res.body.should.have.property '_id'
                runnables.push res.body._id
                cb()
        , (cb) ->
            user.get("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then done err else
                res.should.have.status 200
                res.body.should.be.a.array
                res.body.length.should.equal configs.defaultPageLimit
                done()

  it 'should be able to ::paginate published runnable list', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        runnables = [ ]
        async.whilst () ->
          runnables.length < 5
        , (cb) ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 201
                res.body.should.have.property '_id'
                runnables.push res.body._id
                cb()
        , (err) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?published=true")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 2
                  elem = res.body[1]._id
                  user.get("http://localhost:#{configs.port}/runnables?published=true&page=1&limit=1")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        res.body[0]._id.should.equal elem
                        done()

  it 'should be able to ::paginate published sorted by votes', (done) ->
    helpers.authedUser (err, user) ->
      if err then done err else
        runnables = [ ]
        async.whilst () ->
          runnables.length < 5
        , (cb) ->
          user.post("http://localhost:#{configs.port}/runnables")
            .end (err, res) ->
              if err then cb err else
                res.should.have.status 201
                res.body.should.have.property '_id'
                runnables.push res.body._id
                runnableId = res.body._id
                numVotes = 0
                async.whilst () ->
                  numVotes < runnables.length
                , (cb) ->
                  numVotes++
                  helpers.authedUser (err, user2) ->
                    if err then cb err else
                      user2.post("http://localhost:#{configs.port}/users/me/votes")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify(runnable: runnableId))
                        .end (err, res) ->
                          if err then cb err else
                            res.should.have.status 201
                            cb()
                , cb
        , (err) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?published=true&sort=votes")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 2
                  elem = res.body[1]._id
                  user.get("http://localhost:#{configs.port}/runnables?published=true&sort=votes&page=1&limit=1")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        done()

  it 'should be able to ::paginate channel runnable list', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        token = res.body.access_token
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
            user.get("http://localhost:#{configs.port}/runnables?channel=facebook")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 6
                  elem = res.body[3]._id
                  user.get("http://localhost:#{configs.port}/runnables?channel=facebook&page=3&limit=1")
                    .set('runnable-token', token)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        res.body[0]._id.should.equal elem
                        apiserver.configs.passwordSalt = oldSalt
                        done()

  it 'should be able to ::paginate channel sorted by votes', (done) ->
    user = sa.agent()
    oldSalt = apiserver.configs.passwordSalt
    delete apiserver.configs.passwordSalt
    user.post("http://localhost:#{configs.port}/token")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        res.should.have.status 200
        token = res.body.access_token
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
                      numVotes = 0
                      async.whilst () ->
                        numVotes < runnables.length
                      , (cb) ->
                        numVotes++
                        helpers.authedUser (err, user2) ->
                          if err then cb err else
                            user2.post("http://localhost:#{configs.port}/users/me/votes")
                              .set('content-type', 'application/json')
                              .send(JSON.stringify(runnable: runnableId))
                              .end (err, res) ->
                                if err then cb err else
                                  res.should.have.status 201
                                  cb()
                      , cb
        , (err) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes")
              .set('runnable-token', token)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 6
                  elem = res.body[4]._id
                  user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes&page=2&limit=2")
                    .set('runnable-token', token)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 2
                        res.body[1].should.have.property '_id'
                        apiserver.configs.passwordSalt = oldSalt
                        done()