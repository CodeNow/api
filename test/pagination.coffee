apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'pagination api', ->

  it 'should list ::paginated all ::runnable owned by a given user', (done) ->
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

  it 'should list all ::runnables ::paginated', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 200
          res.body.should.be.a.array
          res.body.forEach (elem) ->
            elem.tags.should.be.a.array
            elem.tags.length.should.be.above 0
          done()

  it 'should be possible to list all ::runnables which are published ::paginated', (done) ->
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

  it 'should be possible to list all ::runnables which belong to a channel ::paginated', (done) ->
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
