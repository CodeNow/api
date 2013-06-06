configs = require './configs'
connect_redis = require 'connect-redis'
express = require 'express'
http = require 'http'
mongoose = require 'mongoose'
session = require './session'
users = require './rest/users'
util = require 'util'

redis_store = connect_redis express
mongoose.connect configs.mongo

app = express()
app.use express.bodyParser()
app.use express.cookieParser()
app.use express.session
  key: configs.cookieKey
  secret: configs.cookieSecret
  store: new redis_store
    ttl: configs.cookieExpires
  cookie:
    path: '/'
    httpOnly: false,
    maxAge: configs.cookieExpires
app.use session
app.use users
app.use app.router

app.get '/', (req, res) ->
  res.json { message: 'hello from runnable api!' }

server = http.createServer app

module.exports =
  configs: configs
  start: (cb) ->
    server.listen configs.port, cb
  stop: (cb) ->
    server.close cb