configs = require './configs'
domain = require 'domain'
error = require './error'
express = require 'express'
http = require 'http'
mongoose = require 'mongoose'
nodetime = require 'nodetime'
runnables = require './rest/runnables'
users = require './rest/users'
channels = require './rest/channels'

mongoose.connect configs.mongo

app = express()

app.use (req, res, next) ->
  d = domain.create()
  d.on 'error', next
  d.run next
if configs.logRequests then app.use express.logger()
app.use express.bodyParser()
app.use users
app.use runnables
app.use channels
app.use app.router
if configs.nodetime then app.use nodetime.expressErrorHandler()
app.use (err, req, res, next) ->
  json_err = { }
  if configs.showStack
    json_err.stack = err.stack
  if configs.logStack
    if (err) then console.log(err.stack || err, '\n')
    if (err.err) then console.log(err.err.stack || err.err, '\n')
  if err.code and err.msg
    json_err.message = err.msg
    res.json err.code, json_err
  else
    json_err.message = 'something bad happened'
    res.json 500, json_err

app.get '/', (req, res) -> res.json { message: 'hello!' }
app.get '/throws', -> throw new Error 'zomg'
app.all '*', (req, res) -> res.json 404, { message: 'operation not found' }

server = http.createServer app

module.exports =
  configs: configs
  start: (cb) ->
    server.listen configs.port, configs.ipaddress || "0.0.0.0", cb
  stop: (cb) ->
    server.close cb
