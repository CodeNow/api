apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'voting api', ->

  it 'should not allow a user to ::vote without specifying runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/votes")
                  .set('content-type', 'application/json')
                  .send(JSON.stringify( {  } ))
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 400
                      res.body.should.have.property 'message', 'must include runnable to vote on'
                      instance.stop done

  it 'should not allow a user to ::vote for their own runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/votes")
                  .set('content-type', 'application/json')
                  .send(JSON.stringify( { runnable: runnableId } ))
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      res.body.should.have.property 'message', 'cannot vote for own runnables'
                      instance.stop done

  it 'should allow a user to ::vote for a runnable they do not own', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
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
                          instance.stop done

  it 'should allow a user to retrieve a list of their ::votes', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
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
                              instance.stop done


  it 'should not allow a user to ::vote twice for the same runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
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
                                instance.stop done

  it 'should increase the ::vote count of a runnable after the vote is applied', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
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
                                  instance.stop done

  it 'should decrease the ::vote count of a runnable after a vote is removed', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createUserImage user, 'node.js', (err, runnableId) ->
              if err then done err else
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
                                            instance.stop done

  it 'should be able to list all runnables in descending order of ::votes', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            helpers.createImage 'node.js', (err, imageId) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                        helpers.createNamedTaggedImage user, imageId, "node #{runnables.length}", 'node.js', (err, runnableId) ->
                          if err then done err else
                            runnables.push runnableId
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
                                          instance.stop done

  it 'should be able to list all runnables in descending order of ::votes after runnable is deleted', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, imageId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      helpers.createNamedTaggedImage user, imageId, "Node #{runnables.length}", 'node.js', (err, runnableId) ->
                        if err then done err else
                          runnables.push runnableId
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
                                    user.del("http://localhost:#{configs.port}/runnables/#{voted[0]}")
                                      .end (err, res) ->
                                        if err then done err else
                                          user.get("http://localhost:#{configs.port}/runnables?sort=votes")
                                            .end (err, res) ->
                                              if err then done err else
                                                res.should.have.status 200
                                                res.should.have.property 'body'
                                                res.body.should.be.a.array
                                                res.body.length.should.equal 5
                                                voted.should.include res.body[0]._id
                                                voted.should.include res.body[1]._id
                                                res.body[0].should.have.property 'votes', 1
                                                res.body[1].should.have.property 'votes', 1
                                                res.body[3].should.have.property 'votes', 0
                                                res.body[4].should.have.property 'votes', 0
                                                instance.stop done

  it 'should be able to list channel runnables in descending order of ::votes', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            helpers.createImage 'node.js', (err, imageId) ->
              if err then done err else
                helpers.createNamedTaggedImage user, imageId, 'twitter runnable', 'twitter', (err, runnableId) ->
                  if err then done err else
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      helpers.createNamedTaggedImage user, imageId, "facebook #{runnables.length}", 'facebook', (err, runnableId2) ->
                        if err then done err else
                          runnables.push runnableId2
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
                                    user.get("http://localhost:#{configs.port}/runnables?channel=facebook&sort=votes")
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
                                          instance.stop done


  it 'should be able to list users runnables in descending order of ::votes', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user2) ->
          if err then done err else
            user2.get("http://localhost:#{configs.port}/users/me")
              .end (err, res) ->
                helpers.createUserImage user2, 'node.js', (err, imageId) ->
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
                                          instance.stop done

  it 'should be able to list published runnables in descending order of ::votes', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            helpers.createImage 'node.js', (err, imageId) ->
              if err then done err else
                helpers.createNamedTaggedImage user, imageId, 'runnable', 'twitter', (err, runnableId) ->
                  if err then done err else
                    runnables = [ ]
                    async.whilst () ->
                      runnables.length < 5
                    , (cb) ->
                      helpers.createNamedTaggedImage user, imageId, "Runnable #{runnables.length}", 'facebook', (err, runnableId) ->
                        if err then cb err else
                          runnables.push runnableId
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
                                    user.get("http://localhost:#{configs.port}/runnables?published=true&sort=votes")
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
                                          instance.stop done