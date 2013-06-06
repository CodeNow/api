configs = require 'configs'
express = require 'express'
http = require 'http'
util = require 'util'

app = express()
server = http.createServer app

module.exports =
  start: (cb) ->
    server.listen configs.port, cb
  stop: (cb) ->
    server.close cb
