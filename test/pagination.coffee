apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

# TODO: these tests dont work because runnable names need to be unique
# they create new runnables in a loop from new base images

describe 'pagination api', ->

 it 'should be able to ::paginate a users own runnable list', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    res.should.have.status 200
                    owner = res.body._id
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                        if err then cb err else
                          runnables.push runnableId
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
                                    instance.stop done

  it 'should be able to ::paginate all runnables', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                runnables = [ ]
                async.whilst () ->
                  runnables.length < 5
                , (cb) ->
                  helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                    if err then cb err else
                      runnables.push runnableId
                      cb()
                , (err) ->
                  if err then done err else
                    user.get("http://localhost:#{configs.port}/runnables")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 6
                          elem = res.body[2]._id
                          user.get("http://localhost:#{configs.port}/runnables?page=2&limit=1")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.be.a.array
                                res.body.length.should.equal 1
                                res.body[0]._id.should.equal elem
                                instance.stop done

  it 'should have a default ::paginate of configs.defaultPageLimit when listing when', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            oldLimit = instance.configs.defaultPageLimit
            instance.configs.defaultPageLimit = 5
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                runnables = [ ]
                async.whilst () ->
                  runnables.length < 7
                , (cb) ->
                  helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                    if err then cb err else
                      runnables.push runnableId
                      cb()
                , (err) ->
                    user.get("http://localhost:#{configs.port}/runnables")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal instance.configs.defaultPageLimit
                        instance.configs.defaultPageLimit = oldLimit
                        instance.stop done

  it 'should be able to ::paginate published runnable list', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                runnables = [ ]
                async.whilst () ->
                  runnables.length < 5
                , (cb) ->
                  helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                    if err then cb err else
                      runnables.push runnableId
                      cb()
                , (err) ->
                  if err then done err else
                    user.get("http://localhost:#{configs.port}/runnables?published=true")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 5
                          elem = res.body[1]._id
                          user.get("http://localhost:#{configs.port}/runnables?published=true&page=1&limit=1")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.be.a.array
                                res.body.length.should.equal 1
                                res.body[0]._id.should.equal elem
                                instance.stop done

  it 'should be able to ::paginate channel runnable list', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
           helpers.authedRegisteredUser (err, user) ->
            if err then done err else
              runnables = [ ]
              async.whilst () ->
                runnables.length < 5
              , (cb) ->
                helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                  if err then cb err else
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
                        res.body.length.should.equal 5
                        elem = res.body[3]._id
                        user.get("http://localhost:#{configs.port}/runnables?channel=facebook&page=3&limit=1")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.be.a.array
                              res.body.length.should.equal 1
                              res.body[0]._id.should.equal elem
                              instance.stop done

  it 'should be able to ::paginate channel runnable list (multiple tags)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                runnables = [ ]
                async.whilst () ->
                  runnables.length < 5
                , (cb) ->
                  helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'node.js', (err, runnableId) ->
                    if err then cb err else
                      runnables.push runnableId
                      user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify(name: 'facebook'))
                        .end (err, res) ->
                          user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/tags")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(name: 'twitter'))
                            .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              cb()
                , (err) ->
                  if err then done err else
                    user.get("http://localhost:#{configs.port}/runnables?channel=facebook&channel=twitter")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body.length.should.equal 5
                          elem = res.body[3]._id
                          user.get("http://localhost:#{configs.port}/runnables?channel=facebook&channel=twitter&page=3&limit=1")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.be.a.array
                                res.body.length.should.equal 1
                                res.body[0]._id.should.equal elem
                                instance.stop done