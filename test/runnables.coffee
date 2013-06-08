apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'
should = require 'should'

describe 'runnables api', ->

  it 'should be able to create a new default ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          should.exist res.body
          should.exist res.body.framework
          res.body.framework.should.equal 'node.js'
          done()

  it 'should be able to create a new node.js ::runnable', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=node.js")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          should.exist res.body
          done()

  it 'should report error if the ::runnable framework does not exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables?framework=notfound")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 403
          should.exist res.body.message
          res.body.message.should.equal 'framework does not exist'
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
                  should.exist res.body
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

  it 'should be possible to list all ::runnable which are published', (done) ->
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

  it 'should be possible to list all ::runnable which belong to a channel', (done) ->
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
