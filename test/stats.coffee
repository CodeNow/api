apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'stats api', ->

  it 'should return ::stats when stats are requested', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/stats/runs")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.user.should.equal 0
                      res.body.image.should.equal 0
                      instance.stop done

  it 'should refuse to return ::stats when false stats are requested', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/stats/teapots")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 400
                      instance.stop done

  it 'should increment ::stats when requested', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/stats/runs")
                  .end (err, res) ->
                    if err then done err else
                      res.should.have.status 200
                      res.body.user.should.equal 0
                      res.body.image.should.equal 0
                      user.post("http://localhost:#{configs.port}/runnables/#{runnableId}/stats/runs")
                        .end (err, res) ->
                          if err then done err else
                            res.should.have.status 201
                            res.body.image.runs.should.equal 1
                            instance.stop done