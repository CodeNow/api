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
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/categories")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.be.a.array
                      category.count = 0
                      res.body.should.includeEql category
                      instance.stop done

  it 'should be possible to get a ::category by its ID', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'facebook', (err, category) ->
          if err then done err else
            categoryId = category._id
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/categories/#{categoryId}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.have.property 'name', 'facebook'
                      res.body.should.have.property 'count' , 0
                      instance.stop done

  it 'should be possible to query a ::category by a name or one of its aliases', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'facebook', (err, category) ->
          if err then done err else
            helpers.createCategory 'jquery', (err, category) ->
              if err then done err else
                helpers.authedUser (err, user) ->
                  if err then done err else
                    user.get("http://localhost:#{configs.port}/categories?name=facebook")
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 200
                          res.body.should.be.a.array
                          res.body[0].name.should.equal 'facebook'
                          instance.stop done


# NOT IMPLEMENTED IN CATEGORIES.JS

  it 'should keep a count of the channels a ::category has been tagged to', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'social', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedAdminUser (err, admin) ->
                  if err then done err else
                    admin.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({ name: 'social' }))
                      .end (err, res) ->
                        if err then done err else
                          helpers.authedUser (err, user) ->
                            if err then done err else
                              user.get("http://localhost:#{configs.port}/categories?name=social")
                                .end (err, res) ->
                                  if err then done err else
                                    res.should.have.status 200
                                    res.body.should.be.a.array
                                    res.body[0].should.have.property 'name', 'social'
                                    res.body[0].should.have.property 'count', 1
                                    instance.stop done

  it 'should implicitly create a ::category by tagging a channel with a non-existent one', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'facebook', (err, channel) ->
          if err then done err else
            helpers.authedAdminUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
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

  it 'should be possible to update the set of aliases of a ::category by admins', (done) ->
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
                  aliasSet = [ 'this', 'is', 'a', 'new', 'set' ]
                  user.put("http://localhost:#{configs.port}/categories/#{res.body._id}/aliases")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(aliasSet))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.eql aliasSet
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
                  res.body.should.have.property 'description', 'category description'
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
                        res.should.have.status 200
                        res.body.should.have.property 'description', 'this is a category description'
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
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/categories")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'newCategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  res.body.should.have.property '_id'
                  helpers.authedRegisteredUser (err, reg_user) ->
                    if err then done err else
                      reg_user.del("http://localhost:#{configs.port}/categories/#{res.body._id}")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 403
                            res.body.should.have.property 'message', 'permission denied'
                            instance.stop done