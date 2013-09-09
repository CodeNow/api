async = require 'async'
configs = require '../lib/configs'
dockerjs = require 'docker.js'
fs = require 'fs'
mkdirp = require 'mkdirp'
mongodb = require 'mongodb'
redis = require 'redis'
state = require './state'

db = mongodb.Db

redis_client = redis.createClient()
docker = dockerjs host: configs.direct_docker

beforeEach (done) ->
  done = wrapDone done
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
  done = wrapDone done
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then done err else
        test_db.dropDatabase (err) ->
          if err then done err else
            test_db.close done

before (done) ->
  done()

after (done) ->
  cleanup done

process.on 'SIGINT', () ->
  cleanup (err) ->
    if err then console.log 'error cleaning up', err
    process.exit(); #always

wrapDone = (done) ->
  donedone = done
  (err) ->
    if err? then cleanup () -> donedone err else donedone()

cleanup = (cb) ->
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      if err then cb err else
        test_db.dropDatabase (err) ->
          if err then cb err else
            test_db.close cb
