async = require 'async'
configs = require '../lib/configs'
dockerjs = require 'docker.js'
fs = require 'fs'
mkdirp = require 'mkdirp'
mongodb = require 'mongodb'
redis = require 'redis'
rimraf = require 'rimraf'
state = require './state'
_ = require 'lodash'

db = mongodb.Db

redis_client = redis.createClient()
docker = dockerjs host: configs.direct_docker

beforeEach (done) ->
  done = wrapDone done
  db.connect configs.mongo, (err, test_db) ->
    if err then done err else
      projectIds = [ ]
      userId = null
      async.series [
        (cb) ->
          test_db.collection 'images', (err, projects) ->
            async.forEachSeries state.Projects, (project, cb) ->
              projects.insert project, (err, project) ->
                if err then cb err else
                  projectIds.push project[0]._id
                  cb()
            , cb
        (cb) ->
          test_db.collection 'users', (err, users) ->
            state.Users[0].votes = [ ]
            for id in projectIds
              state.Users[0].votes.push
                runnable: id
            async.forEachSeries state.Users, (user, cb) ->
              users.insert user, (err, user) ->
                if not userId then userId = user[0]._id
                if err then cb err else
                  cb()
            , cb
        (cb) ->
          test_db.collection 'images', (err, projects) ->
            if err then cb err else
              projects.update { }, { $set: owner: userId }, cb
      ], (err) ->
        if err then done err else
          test_db.close done

afterEach (done) ->
  done = wrapDone done
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
  done = wrapDone done
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
  cleanup done

process.on 'SIGINT', () ->
  cleanup (err) ->
    if err then console.log 'error cleaning up', err
    process.exit(); #always

wrapDone = (done) ->
  donedone = done
  done = (err) ->
    if err? then cleanup () -> donedone err else donedone()

cleanup = (cb) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then cb err else
        test_db.dropDatabase (err) ->
          if err then cb err else
            test_db.close cb