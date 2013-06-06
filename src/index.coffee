configs = require 'configs'
express = require 'express'
http = require 'http'

app = express()
server = http.createServer app

module.exports =
  start: (cb) ->
    server.listen configs.port, cb
  stop: (cb) ->
    server.close cb

process.on 'uncaughtException', (err) ->
  console.inspect err
  process.exit 1