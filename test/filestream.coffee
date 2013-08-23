apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file streams api', ->

  it 'should be able to ::stream a new file of a ace type to the root path of a runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body[0].should.have.property '_id'
                  fileId = res.body[0]._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'content'
                        instance.stop done

  it 'should be able to ::stream a new file of a non-ace type (uncached) to the root path of a runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('image', "#{__dirname}/fixtures/files/runnable.png", 'runnable.jpg')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body[0].should.have.property '_id'
                  fileId = res.body[0]._id
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.not.have.property 'content'
                        instance.stop done

  it 'should be able to ::stream a new file of a ace type to a sub-directory of a runnable', (done) ->
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
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                    .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.be.a.array
                        res.body[0].should.have.property '_id'
                        fileId = res.body[0]._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'content'
                              instance.stop done

  it 'should be able to ::stream a new file of a non-ace type (uncached) to a sub-directory of a runnable', (done) ->
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
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                    .attach('image', "#{__dirname}/fixtures/files/runnable.png", 'runnable.png')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.be.a.array
                        res.body[0].should.have.property '_id'
                        fileId = res.body[0]._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.not.have.property 'content'
                              instance.stop done

  it 'should not be able to ::stream a new file if the resource is not of a directory type', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body[0]._id
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                    .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'resource is not of directory type'
                        instance.stop done

  it 'should not be able to ::stream a new file if the resource does not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{runnableId}")
              .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 404
                  res.body.should.have.property 'message', 'file does not exist'
                  instance.stop done

  it 'should be able to ::stream a file update of an ace type to the root of a runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('code', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body[0]._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .attach('code', "#{__dirname}/fixtures/files/sample2.js", 'sample.js')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.have.property 'content', "console.log('this is a second file sample!');"
                              instance.stop done

  it 'should be able to ::stream a file update of a non-ace type (uncached) to an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('image', "#{__dirname}/fixtures/files/runnable.png", 'runnable.png')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  fileId = res.body[0]._id
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .attach('image', "#{__dirname}/fixtures/files/runnable.png", 'runnable.png')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.not.have.property 'content'
                              instance.stop done

  it 'should be able to ::stream a group of new ace type files atomically to an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('code1', "#{__dirname}/fixtures/files/sample.js", 'sample1.js')
              .attach('code2', "#{__dirname}/fixtures/files/sample.js", 'sample2.js')
              .attach('code3', "#{__dirname}/fixtures/files/sample.js", 'sample3.js')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body.length.should.equal 3
                  async.forEach res.body, (elem, cb) ->
                    fileId = elem._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.have.property 'content', "console.log('this is a file sample!');"
                          cb()
                  , (err) ->
                    if err then done err else
                      instance.stop done

  it 'should be able to ::stream a group of new non-ace type files atomically to an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
              .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
              .attach('image3', "#{__dirname}/fixtures/files/runnable.png", 'runnable3.png')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body.length.should.equal 3
                  async.forEach res.body, (elem, cb) ->
                    fileId = elem._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.not.have.property 'content'
                          cb()
                  , (err) ->
                    if err then done err else
                      instance.stop done

  it 'should be able to ::stream a group of new mixed ace / non-ace type files atomically to an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
              .attach('code1', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body.length.should.equal 3
                  async.forEach res.body, (elem, cb) ->
                    fileId = elem._id
                    user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          if res.body.name is 'sample.js'
                            res.body.should.have.property 'content'
                          else
                            res.body.should.not.have.property 'content'
                          cb()
                  , (err) ->
                    if err then done err else
                      instance.stop done

  it 'should be able to ::stream a group of existing mixed ace / non-ace type files atomically to an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js', (err, user, runnableId) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
              .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
              .attach('code1', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
              .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.be.a.array
                  res.body.length.should.equal 3
                  files = res.body
                  user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
                    .attach('code1', "#{__dirname}/fixtures/files/sample2.js", 'sample.js')
                    .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 3
                        async.forEach files, (elem, cb) ->
                          fileId = elem._id
                          user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                if res.body.name is 'sample.js'
                                  res.body.should.have.property 'content', "console.log('this is a second file sample!');"
                                else
                                  res.body.should.not.have.property 'content'
                                cb()
                        , (err) ->
                          if err then done err else
                            instance.stop done

  it 'should be able to ::stream a group of existing mixed ace / non-ace type files atomically in a subdirectory of an existing runnable', (done) ->
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
                  user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                    .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
                    .attach('code1', "#{__dirname}/fixtures/files/sample.js", 'sample.js')
                    .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        res.body.should.be.a.array
                        res.body.length.should.equal 3
                        files = res.body
                        user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{dirId}")
                          .attach('image1', "#{__dirname}/fixtures/files/runnable.png", 'runnable1.png')
                          .attach('code1', "#{__dirname}/fixtures/files/sample2.js", 'sample.js')
                          .attach('image2', "#{__dirname}/fixtures/files/runnable.png", 'runnable2.png')
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.be.a.array
                              res.body.length.should.equal 3
                              async.forEach files, (elem, cb) ->
                                fileId = elem._id
                                user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{fileId}")
                                  .end (err, res) ->
                                    if err then done err else
                                      res.should.have.status 200
                                      if res.body.name is 'sample.js'
                                        res.body.should.have.property 'content', "console.log('this is a second file sample!');"
                                      else
                                        res.body.should.not.have.property 'content'
                                      cb()
                              , (err) ->
                                if err then done err else
                                  instance.stop done