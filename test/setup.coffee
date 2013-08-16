async = require 'async'
configs = require '../lib/configs'
dockerjs = require 'docker.js'
fs = require 'fs'
mkdirp = require 'mkdirp'
mongodb = require 'mongodb'
redis = require 'redis'
rimraf = require 'rimraf'
state = require './state'

db = mongodb.Db

redis_client = redis.createClient()
docker = dockerjs host: configs.direct_docker

beforeEach (done) ->
  db.connect configs.mongo, (err, test_db) ->
    if err then done err else
      async.series [
        (cb) ->
          test_db.collection 'users', (err, users) ->
            async.forEachSeries state.Users, (user, cb) ->
              users.insert user, cb
            , cb
      ], (err) ->
        if err then done err else
          test_db.close done

afterEach (done) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then done err else
        test_db.dropDatabase (err) ->
          if err then done err else
            test_db.close () ->
              docker.listContainers (err, containers) ->
                if err then done err else
                  async.forEach containers, (container, cb) ->
                    docker.stopContainer container.Id, cb
                  , (err) ->
                    if err then done err else
                      docker.listContainers queryParams: all: true, (err, containers) ->
                        if err then done err else
                          async.forEach containers, (container, cb) ->
                            docker.removeContainer container.Id, cb
                          , done

before (done) ->
  docker.listContainers (err, containers) ->
    if err then done err else
      async.forEach containers, (container, cb) ->
        docker.stopContainer container.Id, cb
      , (err) ->
        if err then done err else
          docker.listContainers queryParams: all: true, (err, containers) ->
            if err then done err else
              async.forEach containers, (container, cb) ->
                docker.removeContainer container.Id, cb
              , done

after (done) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then done err else
        test_db.dropDatabase (err) ->
          if err then done err else
            test_db.close done