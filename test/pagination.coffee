apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'pagination api', ->

  it 'should be able to ::paginate a users own runnable list', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
                    res.body.length.should.equal 5
                    elem = res.body[2]._id
                    user.get("http://localhost:#{configs.port}/runnables?page=2&limit=1")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          res.body[0]._id.should.equal elem
                          done()

  it 'should be able to ::paginate a users own runnable list sorted by votes', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
              user.get("http://localhost:#{configs.port}/runnables?sort=votes")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.be.a.array
                    res.body.length.should.equal 5
                    elem = res.body[2]._id
                    user.get("http://localhost:#{configs.port}/runnables?sort=votes&page=2&limit=1")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          res.body[0]._id.should.equal elem
                          done()

  it 'should be able to ::paginate all runnable list', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
              user.get("http://localhost:#{configs.port}/runnables?all=true")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.be.a.array
                    res.body.length.should.equal 8
                    elem = res.body[2]._id
                    user.get("http://localhost:#{configs.port}/runnables?all=true&page=2&limit=1")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          res.body[0]._id.should.equal elem
                          done()

  it 'should be able to ::paginate all runnables sorted by votes', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
              user.get("http://localhost:#{configs.port}/runnables?all=true&sort=votes")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.be.a.array
                    res.body.length.should.equal 8
                    user.get("http://localhost:#{configs.port}/runnables?all=true&sort=votes&page=2&limit=1")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 1
                          done()

  it 'should be able to ::paginate published runnable list', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/users/me")
      .end (err, res) ->
        process.nextTick ->
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
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        process.nextTick ->
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
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'facebook'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        cb()
          , (err) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables?channel=facebook")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.be.a.array
                    res.body.length.should.equal 6
                    elem = res.body[3]._id
                    user.get("http://localhost:#{configs.port}/runnables?channel=facebook&page=3&limit=1")
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
    user.post("http://localhost:#{configs.port}/login")
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
      .end (err, res) ->
        process.nextTick ->
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
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'facebook'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        cb()
          , (err) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.be.a.array
                    res.body.length.should.equal 6
                    elem = res.body[4]._id
                    user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes&page=2&limit=2")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 2
                          res.body[1].should.have.property '_id'
                          apiserver.configs.passwordSalt = oldSalt
                          done()