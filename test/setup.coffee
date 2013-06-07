apiserver = require '../lib'
async = require 'async'
configs = require '../lib/configs'
mongodb = require 'mongodb'
redis = require 'redis'
state = require './state'
db = mongodb.Db

beforeEach (done) ->
  db.connect configs.mongo, (err, test_db) ->
    test_db.collection 'users', (err, users) ->
      async.forEachSeries state.Users, (user, cb) ->
        users.insert user, cb
      , () ->
        test_db.close () ->
          apiserver.start done

afterEach (done) ->
  redis_client = redis.createClient()
  redis_client.flushall () ->
    db.connect configs.mongo, (err, test_db) ->
      test_db.dropDatabase () ->
        test_db.close () ->
          apiserver.stop () ->
            done()