cluster = require 'cluster'
configs = require './configs'
debug = require('debug')('express')
domains = require './domains'
error = require './error'
express = require 'express'
http = require 'http'
mongoose = require 'mongoose'
runnables = require './rest/runnables'
users = require './rest/users'
channels = require './rest/channels'

mongoose.connect configs.mongo

app = express()
app.use domains()
if configs.logExpress then app.use express.logger()
app.use express.bodyParser()
app.use users
app.use runnables
app.use channels
app.use app.router
app.use (err, req, res, next) ->
  if configs.throwErrors then throw err
  debug err.stack
  try
    timer = setTimeout () ->
      process.exit 1
    , 30000
    timer.unref()
    server.close()
    cluster.worker.disconnect()
  catch err2
    debug err.stack2
  if not err.code then err.code = 500
  if not err.msg then err.msg = 'boom!'
  res.json err.code, message: err.msg

app.get '/throws', () -> throw new Error 'zomg!'
app.get '/', (req, res) -> res.json { message: 'runnable api' }
app.all '*', (req, res) -> res.json 404, { message: 'resource not found' }

server = http.createServer app

module.exports =
  configs: configs
  start: (cb) -> server.listen configs.port, configs.ipaddress || "0.0.0.0", cb
  stop: (cb) -> server.close cb