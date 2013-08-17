apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'live files api', ->

  it 'should return a request error when attempting to read a ::livefile from an invalid mount point', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name isnt 'node_modules'
                                node_modules_id = entry._id
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 403
                                  res.body.should.have.property 'message', 'entry is not a valid mount point'
                                  instance.stop done

  it 'should read a list of directories and ::livefiles that are associated with a the node_module root', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  hasExpressDir = false
                                  res.body.forEach (elem) ->
                                    if elem.name is 'express' then hasExpressDir = true
                                  hasExpressDir.should.equal true
                                  instance.stop done

  it 'should return a ops error when attempting to write a ::livefile because they are read only', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            user.post("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 403
                                  res.body.should.have.message 'mounted file-system is read only'
                                  instance.stop done

  it 'should include the contents of ::livefile for codemirror typed files of a live directory read', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  # TODO: should lookup based on code mirror list
                                  res.body.forEach (elem) ->
                                    if not elem.dir
                                      elem.should.have.property 'content'
                                  hasExpressDir.should.equal true
                                  instance.stop done

  it 'should be possible to read ::livefile subdirectories off of a live files path', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            query = qs.stringify path: '/express'
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files?#{query}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 200
                                  res.body.should.be.a.array
                                  hasLicense = false
                                  res.body.forEach (elem) ->
                                    if elem.name is 'LICENSE' then hasLicense = true
                                  hasLicense.should.equal true
                                  instance.stop done

  it 'should return an error when trying to read ::livefile subdirectories that do not exist', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            query = qs.stringify path: '/doesnt_exist'
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files?#{query}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 404
                                  res.body.should.have.property 'message', 'path not found'
                                  instance.stop done

  it 'should return a not found error when trying to read ::livefile subdirectories that are not directory types', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createContainer 'node.js_express', (err, user, runnableId) ->
          if err then done err else
            user.put("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ running: true, name: 'name' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        fileId = res.body._id
                        user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files")
                          .end (err, res) ->
                            res.should.have.status 200
                            node_modules_id = null
                            res.body.forEach (entry) ->
                              if entry.name is 'node_modules'
                                node_modules_id = entry._id
                            query = qs.stringify path: '/express/History.md'
                            user.get("http://localhost:#{configs.port}/users/me/runnables/#{runnableId}/files/#{node_modules_id}/files?#{query}")
                              .end (err, res) ->
                                if err then done err else
                                  res.should.have.status 403
                                  res.body.should.have.property 'message', 'resource is not a path'
                                  instance.stop done