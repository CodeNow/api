cluster = require 'cluster'
configs = require './configs'
debug = require('debug')('express')
domains = require './domains'
error = require './error'
express = require 'express'
http = require 'http'
mongoose = require 'mongoose'
nodetime = require 'nodetime'
runnables = require './rest/runnables'
users = require './rest/users'
channels = require './rest/channels'

mongoose.connect configs.mongo

class App

  constructor: (@configs, @domain) ->
    @started = false
    @create()

  start: (cb) ->
    if @started then cb() else
      @server.listen @configs.port, @configs.ipaddress || "0.0.0.0", (err) =>
        if err then cb err else
          @started = true
          cb()

  stop: (cb) ->
    if not @started then cb() else
      @server.close (err) =>
        if err then cb err else
          @started = false
          cb()

  create: () ->
    app = express()
    app.use domains @domain
    if configs.logExpress then app.use express.logger()
    app.use express.bodyParser()
    app.use users
    app.use runnables
    app.use channels
    app.use app.router
    if configs.nodetime then app.use nodetime.expressErrorHandler()
    app.use (err, req, res, next) =>
      if not err.code then err.code = 500
      if not err.msg then err.msg = 'something bad happened :('
      res.json err.code, message: err.msg
      if configs.logErrorStack then debug err.stack
      if cluster.isWorker
        try
          timer = setTimeout () ->
            if configs.nodetime then nodetime.destroy()
            process.exit 1
          , 30000
          timer.unref()
          @stop () ->
          cluster.worker.disconnect()
        catch exception_err
          debug exception_err.stack
    app.get '/throws', (req, res) ->
      process.nextTick req.domain.bind () -> throw new Error 'zomg!'
    app.get '/', (req, res) -> res.json { message: 'runnable api' }
    app.all '*', (req, res) -> res.json 404, { message: 'resource not found' }
    @server = http.createServer app

module.exports = App
