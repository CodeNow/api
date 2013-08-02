apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'

describe 'channels api', ->

  it 'should list ::channels', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/channels")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.should.includeEql
                    name: 'facebook'
                    count: 1
                  res.body.should.includeEql
                    name: 'google'
                    count: 1
                  res.body.should.includeEql
                    name: 'twitter'
                    count: 1
                  res.body.should.includeEql
                    name: 'jquery'
                    count: 1
                  instance.stop done

  it 'should not list out blank ::channels', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/runnables?from=node.js")
              .end (err, res) ->
                console.log res.body
                if err then done err else
                  res.should.have.status 201
                  runnableId = res.body._id
                  user.get("http://localhost:#{configs.port}/channels")
                    .end (err, res) ->
                      console.log res.body
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        instance.stop done

  it 'should be able to create a ::channel if you are a administrator', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/channels")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'jquery'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  channel = res.body
                  user.get("http://localhost:#{configs.port}/channels")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.should.includeEql channel
                        instance.stop done

  it 'should be able to list ::channels by ::category', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/channels")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'testchannel', category:'testcategory'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  channel = res.body
                  user.get("http://localhost:#{configs.port}/channels?category=testcategory")
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 200
                        res.body.should.be.a.array
                        res.body.length.should.equal 1
                        channel.count = 0
                        res.body.should.includeEql channel
                        instance.stop done

  it 'should not be able to create a ::channel without a name if you are an administrator', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/channels")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ description: 'testchannel' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 400
                  instance.stop done

  it 'should not be able to create a ::channel if you are not an administrator', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/channels")
              .set('content-type', 'application/json')
              .send(JSON.stringify({ name: 'testchannel' }))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 403
                  instance.stop done

  it 'should be able to list all ::channel ::categories', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedAdminUser (err, user) ->
          if err then done err else
            user.post("http://localhost:#{configs.port}/channels")
              .set('content-type', 'application/json')
              .send(JSON.stringify(name: 'facebook', category:'category1'))
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 201
                  category1 = res.body.category.pop()
                  user.post("http://localhost:#{configs.port}/channels")
                    .set('content-type', 'application/json')
                    .send(JSON.stringify(name: 'twitter', category:'category2'))
                    .end (err, res) ->
                      if err then done err else
                        res.should.have.status 201
                        category2 = res.body.category.pop()
                        user.get("http://localhost:#{configs.port}/channels/categories")
                          .end (err, res) ->
                            if err then done err else
                              res.should.have.status 200
                              res.body.should.be.a.array
                              res.body.length.should.equal 2
                              res.body.should.includeEql
                                name: 'category1',
                                count: 1
                              res.body.should.includeEql
                                name: 'category2',
                                count: 1
                              instance.stop done