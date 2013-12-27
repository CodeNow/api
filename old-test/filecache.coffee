apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file cache api', ->

  it 'should ::cache file content of files with formats that can be read by ace', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: content))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.js'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  res.body.should.not.have.property 'content'
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'content', content
                        instance.stop done

  it 'should not ::cache file content of files with formats that cannot be read by ace', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.jpg', path: '/', content: content))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.jpg'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  res.body.should.not.have.property 'content'
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.not.have.property 'content'
                        instance.stop done

  it 'should start to ::cache file content of files that were recently renamed with an ace-supported extension', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.jpg', path: '/', content: content))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.jpg'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  res.body.should.not.have.property 'content'
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.not.have.property 'content'
                        user.patch("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.txt'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property 'content', content
                                    instance.stop done

  it 'should remove from the ::cache content of files that were recently renamed to ace-unsupported extensions', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.txt', path: '/', content: content))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.txt'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  res.body.should.not.have.property 'content'
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'content', content
                        user.patch("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.jpg'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.not.have.property 'content'
                                    instance.stop done

  it 'should remove default tag from ::cache files that were recently renamed to ace-unsupported extension', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  fileId = null
                  res.body.forEach (file) ->
                    if file.default then fileId = file._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'default', true
                        user.patch("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.jpg'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property 'default', false
                                    instance.stop done

  it 'should not be possible to tag an uncached file as default since its data is not in ::cache', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.jpg', path: '/', content: content))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.jpg'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  res.body.should.not.have.property 'content'
                  fileId = res.body._id
                  user.patch("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'cannot tag an uncached file as default'
                        instance.stop done

  it 'should remove the contents of files of non-ace types from the ::cache when performing a sync', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_with_image', (err, user, runnableId) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?content=true")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.forEach (file) ->
                    if file.name is 'test.jpg' then file.should.not.have.property 'content'
                  instance.stop done

  it 'should add the contents of files of ace types from the ::cache when performing a sync', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_with_image', (err, user, runnableId) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?content=true")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.forEach (file) ->
                    if file.name is 'package.json' then file.should.have.property 'content'
                    if file.name is 'server.js' then file.should.have.property 'content'
                  instance.stop done
