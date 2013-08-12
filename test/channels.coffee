apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'

describe 'channels api', ->

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

  it 'should not be able to create a ::channel with a duplicate name', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'facebook', (err, channel) ->
          if err then done err else
            helpers.authedAdminUser (err, user) ->
              if err then done err else
                user.post("http://localhost:#{configs.port}/channels")
                  .set('content-type', 'application/json')
                  .send(JSON.stringify(name: 'facebook'))
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 403
                      res.body.should.have.property 'message', 'a channel by this name already exists'
                      instance.stop done

  it 'should be able to create a ::channel implicitly by tagging an image', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedUser (err, user) ->
          if err then done err else
            helpers.createTaggedImage 'node.js', 'facebook', (err, image) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/channels")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.should.be.a.array
                      res.body[0].should.have.property 'name', 'facebook'
                      instance.stop done

  it 'should get a ::channel', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'facebook', (err, channel) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/channels/#{channel._id}")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.name.should.equal 'facebook'
                      res.body.count.should.equal 0
                      instance.stop done

  it 'should list ::channels', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannels [ 'facebook', 'google', 'twitter', 'jquery' ], (err, channel) ->
          if err then done err else
            user.get("http://localhost:#{configs.port}/channels")
              .end (err, res) ->
                if err then done err else
                  res.should.have.status 200
                  res.body.should.be.a.array
                  res.body.should.includeEql
                    name: 'facebook'
                    count: 0
                  res.body.should.includeEql
                    name: 'google'
                    count: 0
                  res.body.should.includeEql
                    name: 'twitter'
                    count: 0
                  res.body.should.includeEql
                    name: 'jquery'
                    count: 0
                  instance.stop done

  it 'should be possible to tag a ::channel with a category as an admin', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedAdminUser (err, user) ->
                  if err then done err else
                    user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({name: 'newCategory'}))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          instance.stop done

  it 'should not be possible to tag a ::channel with a category as < admin privs', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedUser (err, user) ->
                  if err then done err else
                    user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({name: 'newCategory'}))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 403
                          res.body.should.have.property 'message', 'permission denied'
                          instance.stop done

  it 'should be able to list all ::channel tags', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedAdminUser (err, user) ->
                  if err then done err else
                    user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({name: 'newCategory'}))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          user.get("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.be.a.array
                                res.body[0].should.have.property 'name', 'newCategory'
                                instance.stop done

  it 'should be able to get a ::channel tag', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedAdminUser (err, user) ->
                  if err then done err else
                    user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({name: 'newCategory'}))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          user.get("http://localhost:#{configs.port}/channels/#{channel._id}/tags/#{res.body._id}")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.be.a.array
                                res.body.should.have.property 'name', 'newCategory'
                                instance.stop done

  it 'should be able to delete a ::channel tag', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createCategory 'newCategory', (err, category) ->
          if err then done err else
            helpers.createChannel 'facebook', (err, channel) ->
              if err then done err else
                helpers.authedAdminUser (err, user) ->
                  if err then done err else
                    user.post("http://localhost:#{configs.port}/channels/#{channel._id}/tags")
                      .set('content-type', 'application/json')
                      .send(JSON.stringify({name: 'newCategory'}))
                      .end (err, res) ->
                        if err then done err else
                          res.should.have.status 201
                          user.del("http://localhost:#{configs.port}/channels/#{channel._id}/tags/#{res.body._id}")
                            .end (err, res) ->
                              if err then done err else
                                res.should.have.status 200
                                res.body.should.have.property 'message', 'tag deleted'
                                instance.stop done

  it 'should be able to list ::channels by category tag', (done) ->
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
