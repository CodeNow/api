apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'

describe 'categories api', ->

  it 'should be possible to explicitly create a ::category as an admin', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  instance.stop done

  it 'should be not possible to explicitly create a ::category with status < admin', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  res.body.should.have.property 'message', 'permission denied'
                  instance.stop done

  it 'should not be possible to explicitly create a ::category if the name already exists', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.authedAdminUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/categories")
                  .set('content-type', 'application/json')
                  .send(JSON.stringify(name: 'newCategory'))
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      res.body.should.have.property 'message', 'category by that name already exists'
                      instance.stop done

  it 'should be possible to list all ::category', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'facebook', (err, category) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/categories")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.should.includeEql category
                  instance.stop done

  it 'should implicitly create a ::category by tagging a channel with a non-existent one', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'facebook', (err, channel) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/channels/#{channel._id}/categories")
                  .set('content-type', 'application/json')
                  .send(JSON.stringify(name: 'newCategory'))
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 201
                      user.get("http://localhost:#{configs.port}/categories")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 200
                            res.body.should.be.a.array
                            res.body[0].should.have.property 'name', 'newCategory'
                            instance.stop done

  it 'should be possible to explicitly create a ::category with a description', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory', description: 'category description'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  instance.stop done

  it 'should be possible to add a description to an existing ::category', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  user.put("http://localhost:#{configs.port}/categories/#{res.body._id}")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'newCategory', description: 'this is a category description'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        instance.stop done

  it 'should be possible to delete a ::category as an admin', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  user.del("http://localhost:#{configs.port}/categories/#{res.body._id}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.have.property 'message', 'category deleted'
                        instance.stop done

  it 'should not be possible to delete a ::category with < admin privs', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  user.del("http://localhost:#{configs.port}/categories/#{res.body._id}")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 403
                        res.body.should.have.property 'message', 'permission denied'
                        instance.stop done