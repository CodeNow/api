categories = require './rest/categories'
cluster = require 'cluster'
configs = require './configs'
debug = require('debug')('worker')
domains = require './domains'
error = require './error'
express = require 'express'
http = require 'http'
impexp = require './rest/impexp'
mongoose = require 'mongoose'
nodetime = require 'nodetime'
rollbar = require 'rollbar'
runnables = require './rest/runnables'
users = require './rest/users'
musers = require './models/users'
channels = require './rest/channels'

mongoose.connect configs.mongo
if configs.rollbar
  rollbar.init configs.rollbar.key, configs.rollbar.options

class App

  constructor: (@configs, @domain) ->
    @started = false
    @create()

  start: (cb) ->
    if @started then cb() else
      @listener = (err) =>
        if @domain and configs.throwErrors then @domain.emit 'error', err else
          @stop () =>
            if cluster.isWorker then @cleanup_worker()
      process.on 'uncaughtException', @listener
      @server.listen @configs.port, @configs.ipaddress || "0.0.0.0", (err) =>
        if err then cb err else
          @started = true
          cb()

  stop: (cb) ->
    if not @started then cb() else
      process.removeListener 'uncaughtException', @listener
      @server.close (err) =>
        if err then cb err else
          @started = false
          delete @listener
          cb()

  create: () ->
    app = express()
    app.use domains @domain
    if configs.logExpress then app.use express.logger()
    app.use express.json()
    app.use express.urlencoded()
    app.use users @domain
    app.use impexp @domain
    app.use runnables @domain
    app.use channels @domain
    app.use categories @domain
    app.use app.router
    if configs.nodetime then app.use nodetime.expressErrorHandler()
    if configs.rollbar then app.use rollbar.errorHandler()
    app.use (err, req, res, next) =>
      if configs.logErrorStack then console.log err.stack
      if not err.domain and configs.throwErrors and req.parentDomain
        req.parentDomain.emit 'error', err
      else
        res.json 500, message: 'something bad happened :(', error: err.message
        @stop () =>
          if cluster.isWorker then @cleanup_worker()
    app.get '/test/throw/express', (req, res) -> throw new Error 'express'
    app.get '/test/throw/express_async', (req, res) -> process.nextTick () -> throw new Error 'express_async'
    app.get '/test/throw/mongo_pool', (req, res) -> musers.findOne { }, req.domain.intercept () -> throw new Error 'mongo_pool'
    app.get '/test/throw/no_domain', (req, res) -> musers.findOne { }, () -> throw new Error 'no_domain'
    app.get '/', (req, res) -> res.json { message: 'runnable api' }
    app.all '*', (req, res) -> res.json 404, { message: 'resource not found' }
    @server = http.createServer app

  cleanup_worker: () ->
    workerId = cluster.worker.process.pid
    debug 'sending exception message to master', workerId
    cluster.worker.send 'exception'
    if configs.nodetime then nodetime.destroy()
    if configs.rollbar then rollbar.shutdown()
    setTimeout () =>
      try
        debug 'waiting for worker to shut down gracefully', workerId
        timer = setTimeout () ->
          debug 'forcefully shutting down worker', workerId
          process.exit 1
        , 30000
        timer.unref()
      catch exception_err
        if configs.logErrorStack then console.log exception_err.stack
      debug 'disconnecting worker', workerId
      cluster.worker.disconnect()
    , 10000

module.exports = App