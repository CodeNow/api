configs = require 'configs'
express = require 'express'
http = require 'http'

app = express()
server = http.createServer app

module.exports =
  start: (cb) ->
    server.listen cb
  stop: (cb) ->
    server.close cb