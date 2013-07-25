apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'runnables api', ->

  it 'should be able to create a published ::runnable from filesystem', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'docker_id'
                  instance.stop done

  it 'should be able to read a published ::runnable from filesystem', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  res.body.should.have.property 'docker_id'
                  runnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property '_id', runnableId
                        res.body.should.have.property 'tags'
                        res.body.should.have.property 'votes', 0
                        instance.stop done

  it 'should be able to edit a published ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            res.should.have.property 'body'
                            res.body.should.have.property 'docker_id'
                            res.body.should.have.property '_id'
                            res.body.should.have.property 'parent', runnableId
                            res.body.should.have.property 'owner', userId
                            res.body.should.have.property 'token'
                            if instance.configs.shortProjectIds
                              res.body._id.length.should.equal 16
                            else
                              res.body._id.length.should.equal 24
                            runnableId = res.body._id
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  res.body.length.should.equal 3
                                  instance.stop done

  it 'should be able to edit a tagged published ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createTaggedImage 'node.js', 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            res.should.have.property 'body'
                            res.body.should.have.property 'docker_id'
                            res.body.should.have.property '_id'
                            res.body.should.have.property 'parent', runnableId
                            res.body.should.have.property 'owner', userId
                            res.body.should.have.property 'token'
                            if instance.configs.shortProjectIds
                              res.body._id.length.should.equal 16
                            else
                              res.body._id.length.should.equal 24
                            runnableId = res.body._id
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  res.body.length.should.equal 3
                                  instance.stop done

  it 'should be able to query for an existing unsaved ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      myRunnableId = res.body._id
                      user.get("http://localhost:#{configs.port}/users/me/runnables?parent=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body[0].should.have.property '_id', myRunnableId
                            instance.stop done

  it 'should not include file contentes when getting a draft ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      myRunnableId = res.body._id
                      user.get("http://localhost:#{configs.port}/users/me/runnables?parent=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body[0].should.have.property '_id', myRunnableId
                            res.body[0].should.not.have.property 'files'
                            instance.stop done

  it 'should store the long container id associated with a ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'long_docker_id'
                      res.body.long_docker_id.indexOf(res.body.docker_id).should.not.equal -1
                      instance.stop done

  it 'should be able to discard/undo any unsaved changes made while editing a ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      containerId = res.body._id
                      user.del("http://localhost:#{configs.port}/users/me/runnables/#{containerId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.have.property 'message', 'runnable deleted'
                            instance.stop done

  it 'should be able to discard/undo any unsaved changes without removing all containers ::fix in the system ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      firstContainerId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            secondContainerId = res.body._id
                            user.del("http://localhost:#{configs.port}/users/me/runnables/#{secondContainerId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'message', 'runnable deleted'
                                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{firstContainerId}")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.have.property '_id', firstContainerId
                                        instance.stop done

  it 'should be able to save a ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            user.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  res.body.should.have.property 'docker_id'
                                  res.body.should.have.property 'parent', runnableId
                                  res.body.should.have.property 'owner', userId
                                  res.body.should.not.have.property 'files'
                                  instance.stop done

  it 'should not be able to save a ::runnable from a container you do not own', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            helpers.authedUser (err, user2) ->
                              if err then done err else
                                user2.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 403
                                      res.body.should.have.property 'message', 'permission denied'
                                      instance.stop done

  it 'should remember the last image id that a ::runnable was saved to', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            user.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  res.body.should.have.property 'docker_id'
                                  res.body.should.have.property 'parent', runnableId
                                  res.body.should.have.property 'owner', userId
                                  targetId = res.body._id
                                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}")
                                    .end (err, res) ->
                                      if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'target', targetId
                                      instance.stop done

  it 'should be able to ::update a previously saved ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            res.body.should.have.property 'docker_id'
                            res.body.should.have.property 'owner', userId
                            user.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  res.body.should.have.property '_id'
                                  publishedId = res.body._id
                                  res.body.should.have.property 'docker_id'
                                  res.body.should.have.property 'parent', runnableId
                                  res.body.should.have.property 'owner', userId
                                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}")
                                    .set('content-type', 'application/json')
                                    .send(JSON.stringify(name: 'updated project name', running: false))
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.have.property 'name', 'updated project name'
                                        res.body.should.have.property 'running', false
                                        user.put("http://localhost:#{configs.port}/runnables/#{publishedId}?from=#{userRunnableId}")
                                          .end (err, res) ->
                                            if err then done err else
                                              res.should.have.status 200
                                              res.body.should.have.property 'name', 'updated project name'
                                              instance.stop done

  it 'should not be able to ::update a published ::runnable you do not own', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            res.body.should.have.property 'docker_id'
                            res.body.should.have.property 'owner', userId
                            user.put("http://localhost:#{configs.port}/runnables/#{runnableId}?from=#{userRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 403
                                  res.body.should.have.property 'message', 'permission denied'
                                  instance.stop done

  it 'should be able to ::update a published ::runnable you do not own if your are an administrator', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedAdminUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/users/me")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      userId = res.body._id
                      user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            userRunnableId = res.body._id
                            user.put("http://localhost:#{configs.port}/runnables/#{runnableId}?from=#{userRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'owner'
                                  res.body.owner.should.not.equal userId
                                  instance.stop done

  it 'should report error if the ::runnable provided named base does not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then cb err else
            user.post("http://localhost:#{configs.port}/runnables?from=notfound")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'image source not found: notfound'
                  instance.stop done

  it 'should report error when saving/publishing a ::runnable that does not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=Uc9q4lfuYfE_AAA-")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.should.have.property 'message', 'source runnable not found'
                  instance.stop done

  it 'should be able to delete a published ::runnable that you own', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      runnableId = res.body._id
                      user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            publishedRunnableId = res.body._id
                            user.del("http://localhost:#{configs.port}/runnables/#{publishedRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'message', 'runnable deleted'
                                  instance.stop done

  it 'should be able to delete a published ::runnable that you own without deleting every published image ::fix2', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      runnableId = res.body._id
                      user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            firstPublishedRunnableId = res.body._id
                            user.post("http://localhost:#{configs.port}/runnables?from=#{runnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 201
                                  secondPublishedRunnableId = res.body._id
                                  user.del("http://localhost:#{configs.port}/runnables/#{secondPublishedRunnableId}")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.have.property 'message', 'runnable deleted'
                                        user.get("http://localhost:#{configs.port}/runnables/#{firstPublishedRunnableId}")
                                          .end (err, res) ->
                                            if err then done err else
                                              res.should.have.status 200
                                              res.body.should.have.property '_id', firstPublishedRunnableId
                                              instance.stop done

  it 'should create a ::runnable from an existing published one that someone else owns', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      privateRunnableId = res.body._id
                      user.post("http://localhost:#{configs.port}/runnables?from=#{privateRunnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            publishedId = res.body._id
                            helpers.authedUser (err, user2) ->
                              if err then done err else
                                user2.post("http://localhost:#{configs.port}/users/me/runnables?from=#{publishedId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 201
                                      instance.stop done

  it 'should create a ::runnable from an existing published one from channel', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createTaggedImage 'node.js', 'tagname', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=tagname")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      userRunnableId = res.body._id
                      instance.stop done

  it 'should create a ::runnable from an existing published one that someone else owns, save to new, and is in channel', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      userRunnableId = res.body._id
                      user.post("http://localhost:#{configs.port}/runnables?from=#{userRunnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            publishedId = res.body._id
                            helpers.authedUser (err, user2) ->
                              if err then done err else
                                user2.post("http://localhost:#{configs.port}/users/me/runnables?from=#{publishedId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 201
                                      user2ownRunnableId = res.body._id
                                      user2.post("http://localhost:#{configs.port}/runnables?from=#{user2ownRunnableId}")
                                        .end (err, res) ->
                                          if err then done err else
                                            res.should.have.status 201
                                            res.body.should.have.property 'parent', publishedId
                                            instance.stop done

  it 'should be able to retrieve a users ::runnable by its id', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.should.have.property 'body'
                      runnableId = res.body._id
                      user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.should.have.property 'body'
                            res.body.should.have.property '_id', runnableId
                            instance.stop done

  it 'should return not found if the ::runnable id is invalid', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables/12345")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.should.have.property 'body'
                  res.body.should.have.property 'message', 'runnable not found'
                  instance.stop done

  it 'should deny a non-owner from deleting a published ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      res.should.have.property 'body'
                      res.body.should.have.property 'message', 'permission denied'
                      instance.stop done

  it 'should allow an admin to ::delete any ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            user2 = sa.agent()
            oldSalt = instance.configs.passwordSalt
            delete instance.configs.passwordSalt
            data = JSON.stringify
              email: 'test4@testing.com'
              password: 'testing'
            user2.post("http://localhost:#{configs.port}/token")
              .set('Content-Type', 'application/json')
              .send(data)
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  token = res.body.access_token
                  user2.del("http://localhost:#{configs.port}/runnables/#{runnableId}")
                    .set('runnable-token', token)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.should.have.property 'body'
                        res.body.should.have.property 'message', 'runnable deleted'
                        instance.configs.passwordSalt = oldSalt
                        instance.stop done

  it 'should return not found if a ::runnable cannot be found at a given id', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      ownRunnableId = res.body._id
                      user.del("http://localhost:#{configs.port}/users/me/runnables/#{ownRunnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.should.have.property 'body'
                            res.body.should.have.property 'message', 'runnable deleted'
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{ownRunnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 404
                                  res.should.have.property 'body'
                                  res.body.should.have.property 'message', 'runnable not found'
                                  instance.stop done

  it 'should be possible to list all ::runnable owned by a given user', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            user = sa.agent()
            oldSalt = instance.configs.passwordSalt
            delete instance.configs.passwordSalt
            user.post("http://localhost:#{configs.port}/token")
              .set('Content-Type', 'application/json')
              .send(JSON.stringify({ username: 'matchusername5', password: 'testing' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  token = res.body.access_token
                  user.get("http://localhost:#{configs.port}/users/me")
                    .set('runnable-token', token)
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        owner = res.body._id
                        user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                          .set('runnable-token', token)
                          .end (err, res) ->
                            res.should.have.status 201
                            ownRunnable = res.body._id
                            if err then done err else
                              user.post("http://localhost:#{configs.port}/runnables?from=#{ownRunnable}")
                                .set('runnable-token', token)
                                .end (err, res) ->
                                  res.should.have.status 201
                                  publishedId = res.body._id
                                  user.get("http://localhost:#{configs.port}/runnables?owner=#{owner}")
                                    .set('runnable-token', token)
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.be.a.array
                                        res.body.length.should.equal 1
                                        res.body[0]._id.should.equal publishedId
                                        instance.configs.passwordSalt = oldSalt
                                        instance.stop done

  it 'should be possible to list all ::runnables which are published', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?published=true")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 2
                  res.body.forEach (elem) ->
                    elem.tags.should.be.a.array
                    elem.tags.length.should.be.above 0
                  instance.stop done

  it 'should be possible to list all ::runnables which belong to a channel', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables?channel=facebook")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.length.should.equal 1
                  res.body.forEach (elem) ->
                    elem.tags.should.be.a.array
                    elem.tags.length.should.be.above 0
                    elem.tags.should.includeEql { name: 'facebook', id: null }
                  instance.stop done

  it 'should be possible to check the state of abc a stopped ::runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'running', false
                      runnableId = res.body._id
                      user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.have.property 'running', false
                            instance.stop done

  it 'should be able to ::start a ::runnable from a stopped state', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'running', false
                      res.body.should.have.property 'name'
                      name = res.body.name
                      runnableId = res.body._id
                      user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify({ running: true, name: name }))
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.have.property 'running', true
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'running', true
                                  instance.stop done

  it 'should be able to ::stop a ::runnable from a started state', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'running', false
                      name = res.body.name
                      runnableId = res.body._id
                      user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.have.property 'running', false
                            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                              .set('content-type', 'application/json')
                              .send(JSON.stringify({ running: true, name: name}))
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'running', true
                                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.have.property 'running', true
                                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                                          .set('content-type', 'application/json')
                                          .send(JSON.stringify({ running: false, name: name }))
                                          .end (err, res) ->
                                            if err then done err else
                                              res.should.have.status 200
                                              res.body.should.have.property 'running', false
                                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                                                .end (err, res) ->
                                                  if err then done err else
                                                    res.should.have.status 200
                                                    res.body.should.have.property 'running', false
                                                    instance.stop done

  it 'should create a new ::runnable in a stopped state', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'running', false
                      runnableId = res.body._id
                      setTimeout () ->
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'running', false
                              instance.stop done
                      , 1000

  it 'should pass back a service url that the client can hit when a ::runnable is started', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      res.body.should.have.property 'running', false
                      name = res.body.name
                      runnableId = res.body._id
                      user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                        .set('content-type', 'application/json')
                        .send(JSON.stringify({ running: true, name: name }))
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.have.property 'running', true
                            instance.stop done