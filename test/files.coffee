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