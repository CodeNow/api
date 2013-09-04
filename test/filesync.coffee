apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'file sync feature', ->

  it 'should not ::sync image when passing sync=false to the create command', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createUnsyncedImage 'node.js', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.not.have.property 'synced'
                    instance.stop done

  it 'should ::sync when creating an image by default', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'node.js', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'synced', true
                    instance.stop done

  it 'should ::sync an image based on cakephp framework', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'cakephp', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'synced', true
                    instance.stop done

  it 'should ::sync an image based on code igniter framework', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'code_igniter', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 200
                    res.body.should.have.property 'synced', true
                    instance.stop done

  it 'should ::sync an unsynced image when creating a container from it for the first time', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                                      instance.stop done

  it 'should not ::sync shell files when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync missing files when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync missing folders when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync files inside folders when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync files which are removed when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should not ::sync files inside ignored folders when building an image from dockerfile', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync an image based on cakephp ::php framework using migration path', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createUnsyncedImage 'cakephp', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'synced', true
                          instance.stop done

  it 'should ::sync an image based on code igniter ::php framework using migration path', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createUnsyncedImage 'code_igniter', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    user.get("http://localhost:#{configs.port}/runnables/#{runnableId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'synced', true
                          instance.stop done

  it 'should not ::sync shell files when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync missing files when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync missing folders when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync files inside folders when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should ::sync files which are removed when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should not ::sync files inside ignored folders when building an image from dockerfile (migration)', (done) ->
    helpers.createServer configs, done, (err, instance) ->
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
                          instance.stop done

  it 'should read ::synced file data from mongodb entry for the container', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'node.js', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    userRunnableId = res.body._id
                    res.body.should.have.property 'servicesToken'
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
                                          instance.stop done

  it 'should ::sync out of ::band container file changes with an explicit sync() call', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'node.js', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    userRunnableId = res.body._id
                    res.body.should.have.property 'servicesToken'
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
                                                instance.stop done


  it 'should ::sync a file that is removed out of ::band when a container sync() is called', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      helpers.createImage 'node.js', (err, runnableId) ->
        if err then done err else
          helpers.authedUser (err, user) ->
            if err then done err else
              user.post("http://localhost:#{configs.port}/users/me/runnables?from=#{runnableId}")
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 201
                    userRunnableId = res.body._id
                    res.body.should.have.property 'servicesToken'
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
                                                instance.stop done
