apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'file sync feature', ->

  it 'should not ::sync image when passing sync=false to the create command', (done) ->
    helpers.createUnsyncedImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.not.have.property 'synced'
                  done()

  it 'should ::sync when creating an image by default', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.have.property 'synced', true
                  done()

  it 'should ::sync an unsynced image when creating a container from it for the first time', (done) ->
    helpers.createUnsyncedImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.not.have.property 'synced'
                  user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        userRunnableId = res.body._id
                        user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'synced', true
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.be.a.array
                                    for elem in res.body
                                      elem.name.should.not.equal '.bashrc'
                                      elem.name.should.not.equal '.profile'
                                    done()

  it 'should not ::sync shell files when building an image from dockerfile', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        for elem in res.body
                          elem.name.should.not.equal '.bashrc'
                          elem.name.should.not.equal '.profile'
                        done()

  it 'should ::sync missing files when building an image from dockerfile', (done) ->
    helpers.createImage 'missing_file', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.have.length 4
                        done()

  it 'should ::sync missing folders when building an image from dockerfile', (done) ->
    helpers.createImage 'missing_folder', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.have.length 5
                        done()

  it 'should ::sync files inside folders when building an image from dockerfile', (done) ->
    helpers.createImage 'file_in_folder', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        found = false
                        for elem in res.body
                          if elem.name is 'sub_file.js' and elem.path is '/sub_dir'
                            found = true
                        found.should.equal true
                        done()

  it 'should ::sync files which are removed when building an image from dockerfile', (done) ->
    helpers.createImage 'removed_file', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 3
                        done()

  it 'should not ::sync files inside ignored folders when building an image from dockerfile', (done) ->
    helpers.createImage 'node.js_express', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        for elem in res.body
                          elem.path.should.not.include 'node_modules'
                        done()

  it 'should not ::sync shell files when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        for elem in res.body
                          elem.name.should.not.equal '.bashrc'
                          elem.name.should.not.equal '.profile'
                        done()

  it 'should ::sync missing files when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'missing_file', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.have.length 4
                        done()

  it 'should ::sync missing folders when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'missing_folder', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.have.length 5
                        done()

  it 'should ::sync files inside folders when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'file_in_folder', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        found = false
                        for elem in res.body
                          if elem.name is 'sub_file.js' and elem.path is '/sub_dir'
                            found = true
                        found.should.equal true
                        done()

  it 'should ::sync files which are removed when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'removed_file', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 3
                        done()

  it 'should not ::sync files inside ignored folders when building an image from dockerfile (migration)', (done) ->
    helpers.createUnsyncedImage 'node.js_express', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        for elem in res.body
                          elem.path.should.not.include 'node_modules'
                        done()

  it 'should read ::synced file data from mongodb entry for the container', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  res.body.should.have.property 'token'
                  token = res.body.token
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = null
                        for elem in res.body
                          if elem.name is 'server.js'
                            file_id = elem._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files/#{file_id}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'content'
                              content = res.body.content
                              terminalUrl = "http://terminals.runnableapp.dev/term.html?termId=#{token}"
                              helpers.sendCommand terminalUrl, 'echo overwrite > server.js', (err, output) ->
                                if err then done err else
                                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files/#{file_id}")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 200
                                        res.body.should.have.property 'content', content
                                        done()

  it 'should ::sync out of ::band container file changes with an explicit sync() call', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  res.body.should.have.property 'token'
                  token = res.body.token
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = null
                        for elem in res.body
                          if elem.name is 'server.js'
                            file_id = elem._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files/#{file_id}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'content'
                              content = res.body.content
                              terminalUrl = "http://terminals.runnableapp.dev/term.html?termId=#{token}"
                              helpers.sendCommand terminalUrl, 'echo overwrite > server.js', (err, output) ->
                                if err then done err else
                                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/sync")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 201
                                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files/#{file_id}")
                                          .end (err, res) ->
                                            if err then done err else
                                              res.should.have.status 200
                                              res.body.should.have.property 'content'
                                              res.body.content.should.equal 'overwrite\n'
                                              done()


  it 'should ::sync a file that is removed out of ::band when a container sync() is called', (done) ->
    helpers.createImage 'node.js', (err, runnableId) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  userRunnableId = res.body._id
                  res.body.should.have.property 'token'
                  token = res.body.token
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = null
                        for elem in res.body
                          if elem.name is 'server.js'
                            file_id = elem._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files/#{file_id}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'content'
                              content = res.body.content
                              terminalUrl = "http://terminals.runnableapp.dev/term.html?termId=#{token}"
                              helpers.sendCommand terminalUrl, 'rm server.js', (err, output) ->
                                if err then done err else
                                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/sync")
                                    .end (err, res) ->
                                      if err then done err else
                                        res.should.have.status 201
                                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{userRunnableId}/files")
                                          .end (err, res) ->
                                            if err then done err else
                                              res.should.have.status 200
                                              res.body.should.be.a.array
                                              res.body.length.should.equal 2
                                              done()

  ### NEXT ITERATION ###

  it 'should ::sync container changes automatically when publishing to an image'
  it 'should read ignored file contents directly from disk, without ::syncing'
  it 'should write file changes for ignored files directly to container volume without ::syncing'