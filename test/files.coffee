apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'files api', ->

  it 'should be able to insert a new ::file in the project root as a json object', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.js'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  instance.stop done

  it 'should return an error when inserting a new ::file without ::content-type field being set', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'content type must be application/json'
                  instance.stop done

  it 'should be able to read back a root ::file that was previously inserted', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      res.should.have.status 200
                      res.body.should.have.property 'name', 'hello.js'
                      res.body.should.have.property 'path', '/'
                      res.body.should.have.property 'content', encodedContent
                      instance.stop done

  it 'should update last_write when we write new ::files in the project', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                    .end (err, res) ->
                      if err then done err else
                        res.body.should.have.property 'last_write'
                        last_write = new Date(res.body.last_write)
                        user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello2.js', path: '/', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.body.should.have.property 'last_write'
                                    new_last_write = new Date(res.body.last_write)
                                    new_last_write.getTime().should.be.above last_write.getTime()
                                    instance.stop done

  it 'should return file not found when trying to read a ::file that doesnt exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/12345")
              .end (err, res) ->
                res.should.have.status 404
                res.body.should.have.property 'message', 'file does not exist'
                instance.stop done

  it 'should return runnable not found when reading a ::file from a runnable that doesnt exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/users/me/runnables/UbZ8eWxw-jrWAAAL/files/12345")
              .end (err, res) ->
                res.should.have.status 404
                res.body.should.have.property 'message', 'runnable not found'
                instance.stop done

  it 'should return bad request when creating a ::file without a path', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a path field'
                  instance.stop done

  it 'should return bad request when creating a ::file without a content field', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a content field'
                  instance.stop done

  it 'should return bad request when creating a ::file without a name field', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a name field'
                  instance.stop done

  it 'should not be able to create a new ::file in a directory that doesnt exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/noexist', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.should.have.property 'message', 'path does not exist'
                  instance.stop done

  it 'should be able to create a new ::file as a directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'newdir'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property 'dir',  true
                  res.body.should.have.property '_id'
                  instance.stop done

  it 'should be able to create a new ::file inside a sub-directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.have.property 'name', 'hello.js'
                        res.body.should.have.property 'path', '/newdir'
                        res.body.should.have.property '_id'
                        instance.stop done

  it 'should be able to read back a ::file inside a sub-directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.have.property '_id'
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.have.property 'name', 'hello.js'
                            res.body.should.have.property 'path', '/newdir'
                            res.body.should.have.property 'content', encodedContent
                            instance.stop done

  it 'should not be able to create a ::file when the file already exists on disk', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'resource already exists'
                        instance.stop done

  it 'should not be able to create a directory when a ::file already exists', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'resource already exists'
                        instance.stop done

  it 'should be able to update an existing ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(content: encodedNewContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello.js'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        instance.stop done

  it 'should return error if ::content-type is not set when updating a ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .send(JSON.stringify(content: encodedNewContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 400
                        res.body.should.have.property 'message', 'content type must be application/json'
                        instance.stop done

  it 'should be able to update an existing ::file by ::patching content', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  user.patch("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(content: encodedNewContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello.js'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        instance.stop done

  it 'should be able to read back an update to an existing ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(content: encodedNewContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.have.property 'name', 'hello.js'
                            res.body.should.have.property 'path', '/'
                            res.body.should.have.property 'content', encodedNewContent
                            instance.stop done

  it 'should not be able to update a ::file that does not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            process.nextTick ->
              user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/12345")
                .set('content-type', 'application/json')
                .send(JSON.stringify(content: encodedContent))
                .end (err, res) ->
                  if err then done err else
                    res.should.have.status 404
                    res.body.should.have.property 'message', 'file does not exist'
                    instance.stop done

  it 'should not be able to update a ::file contents that is actually a directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'cannot update contents of a directory'
                        instance.stop done

  it 'should be able to rename an existing ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2.js'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello2.js'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        instance.stop done

  it 'should be able to rename an existing ::file directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello2'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        instance.stop done

  it 'should be able to rename an existing ::file directory which already has files in it', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        fileId = res.body._id
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'newDir2'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'name', 'newDir2'
                              res.body.should.have.property 'path', '/'
                              res.body.should.have.property '_id'
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property 'path', '/newDir2'
                                    res.body.should.have.property 'content', encodedContent
                                    instance.stop done

  it 'should be able to change the path of an existing ::file to a new target directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        fileId = res.body._id
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(path: '/'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'name', 'hello.js'
                              res.body.should.have.property 'path', '/'
                              res.body.should.have.property '_id'
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.have.property 'name', 'hello.js'
                                    res.body.should.have.property 'path', '/'
                                    res.body.should.have.property 'content', encodedContent
                                    instance.stop done

  it 'should not be possible to change the name of a ::file to one that already exists', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello2'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'destination resource already exists'
                              instance.stop done

  it 'should not be possible to move a ::file directory into one of its own subdirectories', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2', path: '/hello', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(path: '/hello/hello2'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'cannot move path into itself'
                              instance.stop done

  it 'should not be possible to change the path of a ::file when the detaintion already exists', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'subdir', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.js', path: '/subdir', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              fileId = res.body._id
                              user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                .set('content-type', 'application/json')
                                .send(JSON.stringify(path: '/subdir'))
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 403
                                    res.body.should.have.property 'message', 'destination resource already exists'
                                    instance.stop done

  it 'should change the path of an existing directory with a new target directory ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'subdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'subdir2', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.js', path: '/subdir', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              fileId1 = res.body._id
                              user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                                .set('content-type', 'application/json')
                                .send(JSON.stringify(name: 'hello2.js', path: '/subdir', content: encodedContent))
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 201
                                    fileId2 = res.body._id
                                    user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                                      .set('content-type', 'application/json')
                                      .send(JSON.stringify(path: '/subdir2'))
                                      .end (err, res) ->
                                        if err then done err else
                                          res.should.have.status 200
                                          res.body.should.have.property 'path', '/subdir2'
                                          user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId1}")
                                            .end (err, res) ->
                                              if err then done err else
                                                res.should.have.status 200
                                                res.body.should.have.property 'path', '/subdir2/subdir'
                                                user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId2}")
                                                  .end (err, res) ->
                                                    if err then done err else
                                                      res.should.have.status 200
                                                      res.body.should.have.property 'path', '/subdir2/subdir'
                                                      instance.stop done

  it 'should return an error if the target path of an existing ::file does not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        fileId = res.body._id
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(path: '/noexist'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'destination does not exist'
                              instance.stop done

  it 'should return an error if the target path of an existing ::file is not a directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2.js', path: '/', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        fileId = res.body._id
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(path: '/hello.js'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'destination is not a directory'
                              instance.stop done

  it 'should be able to delete an existing ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'message', 'file deleted'
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 404
                            res.body.should.have.property 'message', 'file does not exist'
                            instance.stop done

  it 'should be able to delete an existing ::file directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'message', 'file deleted'
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                          .end (err, res) ->
                            res.should.have.status 404
                            res.body.should.have.property 'message', 'file does not exist'
                            instance.stop done

  it 'should return an error when non-recurisvely deleting a non-empty ::file directory', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'dir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'dir2', path: '/dir', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'directory is not empty'
                              instance.stop done

  it 'should be able to recursively delete an existing directory ::file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'dir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'dir2', path: '/dir', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        subDirId = res.body._id
                        user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}?recursive=true")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'message', 'file deleted'
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{subDirId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 404
                                    instance.stop done

  it 'should return an error when we try to delete a ::file that doesnt exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.del("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/12345")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.body.should.have.property 'message', 'file does not exist'
                  instance.stop done

  it 'should be possible to tag a ::file as default', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type','application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'default', true
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.have.property 'default', true
                            instance.stop done

  it 'should not be to tag a ::file directory as default', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                    .set('content-type','application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'cannot tag directory as default'
                        instance.stop done

  it 'should be possible to untag a ::file as not default', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type','application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'default', true
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.have.property 'default', true
                            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                              .set('content-type','application/json')
                              .send(JSON.stringify(default: false))
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.have.property 'default', false
                                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                    .end (err, res) ->
                                      res.should.have.status 200
                                      res.body.should.have.property 'default', false
                                      instance.stop done

  it 'should ::list all ::file resources, without contents', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 4
                        for elem in res.body
                          elem.should.not.have.property 'content'
                        instance.stop done

  it 'should ::list all ::file resources, including ::contents', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?content=true")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 4
                        for file in res.body
                          file.should.have.property 'name'
                          if file.name is 'hello.js'
                            file.should.have.property 'content', encodedContent
                        instance.stop done

  it 'should ::list only ::file directories', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            content = 'console.log("Hello, World!");'
            encodedContent = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?dir=true")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.be.a.array
                              res.body.length.should.equal 2
                              res.body[0].should.not.have.property 'content'
                              res.body[1].should.not.have.property 'content'
                              instance.stop done

  it 'should only list ::files, including contents, with the default flag set to true', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            contents = { }
            content = 'console.log("Hello, World!");'
            encodedContent = contents['hello.js'] = (new Buffer(content)).toString('base64')
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  content2 = 'console.log("Hello, World2!");'
                  encodedContent2 = contents['hello2.js'] = (new Buffer(content)).toString('base64')
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2.js', path: '/', content: encodedContent2))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type','application/json')
                          .send(JSON.stringify(default: true))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'default', true
                              user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?default=true")
                                .end (err, res) ->
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  res.body.length.should.equal 2
                                  for file in res.body
                                    file.should.have.property 'name'
                                    file.should.have.property 'default'
                                    file.should.have.property 'content', contents[file.name]
                                  instance.stop done

  it 'should ::list only ::files belonging to a particular path', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'subdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'subdir2', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        fileId = res.body._id
                        content = 'console.log("Hello, World!");'
                        encodedContent = (new Buffer(content)).toString('base64')
                        user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello1.js', path: '/subdir', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              content2 = 'console.log("Hello, World2!");'
                              encodedContent2 = (new Buffer(content)).toString('base64')
                              user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                                .set('content-type', 'application/json')
                                .send(JSON.stringify(name: 'hello2.js', path: '/subdir2', content: encodedContent2))
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 201
                                    query = qs.stringify path: '/subdir', content: true
                                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files?#{query}")
                                      .end (err, res) ->
                                        res.should.have.status 200
                                        res.body.should.be.a.array
                                        res.body.length.should.equal 1
                                        res.body[0].should.have.property 'content', encodedContent
                                        instance.stop done