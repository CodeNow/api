apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
fs = require 'fs'
mkdirp = require 'mkdirp'
mongodb = require 'mongodb'
redis = require 'redis'
rimraf = require 'rimraf'
state = require './state'

db = mongodb.Db

redis_client = redis.createClient()

beforeEach (done) ->
  db.connect configs.mongo, (err, test_db) ->
    if err then done err else
      async.parallel [
        (cb) ->
          test_db.collection 'projects', (err, projects) ->
            async.forEachSeries state.Projects, (project, cb) ->
              projects.insert project, cb
            , cb
        (cb) ->
          test_db.collection 'users', (err, users) ->
            async.forEachSeries state.Users, (user, cb) ->
              users.insert user, cb
            , cb
      ], (err) ->
        if err then done err else
          test_db.close () ->
            fs.exists configs.volumesPath, (exists) ->
              if not exists then mkdirp configs.volumesPath, (err) ->
                if err then done err else
                  apiserver.start done
              else
                apiserver.start done

afterEach (done) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then done err else
        test_db.dropDatabase (err) ->
          if err then done err else
            test_db.close () ->
              rimraf configs.volumesPath, (err) ->
                if err then done err else
                  apiserver.stop () ->
                    done()

after (done) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then done err else
        test_db.dropDatabase (err) ->
          if err then done err else
            test_db.close done