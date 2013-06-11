apiserver = require '../lib'
configs = require '../lib/configs'
sa = require 'superagent'

describe 'files api', ->

  it 'should be able to insert a new ::file in the project root as a json object', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'hello.js'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property '_id'
                  done()

  it 'should be able to read back a root ::file that was previously inserted', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      res.should.have.status 200
                      res.body.should.have.property 'name', 'hello.js'
                      res.body.should.have.property 'path', '/'
                      res.body.should.have.property 'content', encodedContent
                      done()

  it 'should return file not found when trying to read a ::file that doesnt exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/12345")
              .end (err, res) ->
                res.should.have.status 404
                res.body.should.have.property 'message', 'file not found'
                done()

  it 'should return runnable not found when reading a ::file from a runnable that doesnt exist', (done) ->
    user = sa.agent()
    user.get("http://localhost:#{configs.port}/runnables/UbZ8eWxw-jrWAAAL/files/12345")
      .end (err, res) ->
        res.should.have.status 404
        res.body.should.have.property 'message', 'runnable not found'
        done()

  it 'should return bad request when creating a ::file without a path', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a path field'
                  done()

  it 'should return bad request when creating a ::file without a content field', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a content field'
                  done()

  it 'should return bad request when creating a ::file without a name field', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'file must include a name field'
                  done()

  it 'should not be able to create a new ::file in a directory that doesnt exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/noexist', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.should.have.property 'message', 'path does not exist'
                  done()

  it 'should be able to create a new ::file as a directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property 'name', 'newdir'
                  res.body.should.have.property 'path', '/'
                  res.body.should.have.property 'dir',  true
                  res.body.should.have.property '_id'
                  done()

  it 'should be able to create a new ::file inside a sub-directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          res.body.should.have.property 'name', 'hello.js'
                          res.body.should.have.property 'path', '/newdir'
                          res.body.should.have.property '_id'
                          done()

  it 'should be able to read back a ::file inside a sub-directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          res.body.should.have.property '_id'
                          fileId = res.body._id
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                            .end (err, res) ->
                              res.should.have.status 200
                              res.body.should.have.property 'name', 'hello.js'
                              res.body.should.have.property 'path', '/newdir'
                              res.body.should.have.property 'content', encodedContent
                              done()

  it 'should not be able to create a ::file when the file already exists on disk', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'resource already exists'
                        done()

  it 'should not be able to create a directory when a ::file already exists', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'resource already exists'
                        done()

  it 'should be able to update an existing ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(content: encodedNewContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'name', 'hello.js'
                          res.body.should.have.property 'path', '/'
                          res.body.should.have.property '_id'
                          done()

  it 'should be able to read back an update to an existing ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  newContent = 'console.log("Hello, Second World!");'
                  encodedNewContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(content: encodedNewContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                            .end (err, res) ->
                              res.should.have.status 200
                              res.body.should.have.property 'name', 'hello.js'
                              res.body.should.have.property 'path', '/'
                              res.body.should.have.property 'content', encodedNewContent
                              done()

  it 'should not be able to update a ::file that does not exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/12345")
              .set('content-type', 'application/json')
              .send(JSON.stringify(content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.body.should.have.property 'message', 'file not found'
                  done()

  it 'should not be able to update a ::file contents that is actually a directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(content: encodedContent))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'cannot update contents of a directory'
                        done()

  it 'should be able to rename an existing ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2.js'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello2.js'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        done()

  it 'should be able to rename an existing ::file directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'name', 'hello2'
                        res.body.should.have.property 'path', '/'
                        res.body.should.have.property '_id'
                        done()

  it 'should be able to rename an existing ::file directory which already has files in it', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          fileId = res.body._id
                          user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(name: 'newDir2'))
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.have.property 'name', 'newDir2'
                                res.body.should.have.property 'path', '/'
                                res.body.should.have.property '_id'
                                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'path', '/newDir2'
                                      res.body.should.have.property 'content', encodedContent
                                      done()

  it 'should be able to change the path of an existing ::file to a new target directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          fileId = res.body._id
                          user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(path: '/'))
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.have.property 'name', 'hello.js'
                                res.body.should.have.property 'path', '/'
                                res.body.should.have.property '_id'
                                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      res.body.should.have.property 'name', 'hello.js'
                                      res.body.should.have.property 'path', '/'
                                      res.body.should.have.property 'content', encodedContent
                                      done()

  it 'should not be possible to change the name of a ::file to one that already exists', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello2'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'destination resource already exists'
                              done()

  it 'should not be possible to move a ::file directory into one of its own subdirectories', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'hello2', path: '/hello', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(path: '/hello/hello2'))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'cannot move path into itself'
                              done()

  it 'should not be possible to change the path of a ::file when the detaintion already exists', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'subdir', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.js', path: '/subdir', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              fileId = res.body._id
                              user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                                .set('content-type', 'application/json')
                                .send(JSON.stringify(path: '/subdir'))
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 403
                                    res.body.should.have.property 'message', 'destination resource already exists'
                                    done()

  it 'should change the path of an existing directory with a new target directory ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'subdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'subdir2', path: '/', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                          .set('content-type', 'application/json')
                          .send(JSON.stringify(name: 'hello.js', path: '/subdir', content: encodedContent))
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 201
                              fileId1 = res.body._id
                              user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                                .set('content-type', 'application/json')
                                .send(JSON.stringify(name: 'hello2.js', path: '/subdir', content: encodedContent))
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 201
                                    fileId2 = res.body._id
                                    user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                                      .set('content-type', 'application/json')
                                      .send(JSON.stringify(path: '/subdir2'))
                                      .end (err, res) ->
                                        if err then done err else
                                          res.should.have.status 200
                                          res.body.should.have.property 'path', '/subdir2'
                                          user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId1}")
                                            .end (err, res) ->
                                              if err then done err else
                                                res.should.have.status 200
                                                res.body.should.have.property 'path', '/subdir2/subdir'
                                                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId2}")
                                                  .end (err, res) ->
                                                    if err then done err else
                                                      res.should.have.status 200
                                                      res.body.should.have.property 'path', '/subdir2/subdir'
                                                      done()

  it 'should return an error if the target path of an existing ::file does not exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newdir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  content = 'console.log("Hello, World!");'
                  encodedContent = (new Buffer(content)).toString('base64')
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello.js', path: '/newdir', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          fileId = res.body._id
                          user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(path: '/noexist'))
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 403
                                res.body.should.have.property 'message', 'destination does not exist'
                                done()

  it 'should return an error if the target path of an existing ::file is not a directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  process.nextTick ->
                    user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify(name: 'hello2.js', path: '/', content: encodedContent))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          fileId = res.body._id
                          user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                            .set('content-type', 'application/json')
                            .send(JSON.stringify(path: '/hello.js'))
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 403
                                res.body.should.have.property 'message', 'destination is not a directory'
                                done()

  it 'should be able to delete an existing ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'message', 'file deleted'
                        user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 404
                            res.body.should.have.property 'message', 'file not found'
                            done()

  it 'should be able to delete an existing ::file directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'message', 'file deleted'
                        user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                          .end (err, res) ->
                            res.should.have.status 404
                            res.body.should.have.property 'message', 'file not found'
                            done()

  it 'should return an error when non-recurisvely deleting a non-empty ::file directory', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'dir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'dir2', path: '/dir', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 403
                              res.body.should.have.property 'message', 'directory is not empty'
                              done()

  it 'should be able to recursively delete an existing directory ::file', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'dir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'dir2', path: '/dir', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        subDirId = res.body._id
                        user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}?recursive=true")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'message', 'file deleted'
                              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{subDirId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 404
                                    done()

  it 'should return an error when we try to delete a ::file that doesnt exist', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files/12345")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.body.should.have.property 'message', 'file not found'
                  done()

  it 'should be possible to delete the root directory (all ::files)', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'dir', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'dir2', path: '/dir', dir: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        subDirId = res.body._id
                        user.del("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'message', 'deleted all files'
                              user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{subDirId}")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 404
                                    done()

  it 'should be possible to tag a ::file as default', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          content = 'console.log("Hello, World!");'
          encodedContent = (new Buffer(content)).toString('base64')
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', content: encodedContent))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body._id
                  user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                    .set('content-type','application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'default', true
                        user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            res.should.have.status 200
                            res.body.should.have.property 'default', true
                            done()


  it 'should not be to tag a ::file directory as default', (done) ->
    user = sa.agent()
    user.post("http://localhost:#{configs.port}/runnables")
      .end (err, res) ->
        if err then done err else
          res.should.have.status 201
          runnableId = res.body._id
          process.nextTick ->
            user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/files")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'hello.js', path: '/', dir: true))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  dirId = res.body._id
                  user.put("http://localhost:#{configs.port}/runnables/#{runnableId}/files/#{dirId}")
                    .set('content-type','application/json')
                    .send(JSON.stringify(default: true))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'cannot tag directory as default'
                        done()

  it 'should list all ::file resources, without contents'
  it 'should list all ::file resources, including contents'
  it 'should list only ::file directories'
  it 'should list only ::files with default tags, but all directories, with contents'
  it 'should list all ::files but only content from files that are tagged with default'
  it 'should list only ::files belonging to a particular path'