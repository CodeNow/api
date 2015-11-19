/**
 * Mavis is used to find a dock
 * @module lib/models/apis/mavis
 */
'use strict'

var ApiClient = require('simple-api-client')
var bluebird = require('bluebird')
var Boom = require('dat-middleware').Boom
var isObject = require('101/is-object')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')

var log = require('middlewares/logger')(__filename).log

module.exports = Mavis

function Mavis (opts) {
  this.host = process.env.MAVIS_HOST
  log.trace({
    tx: true,
    opts: opts,
    host: this.host
  }, 'Mavis constructor')
  ApiClient.call(this, this.host, opts)
}

util.inherits(Mavis, ApiClient)

Mavis.prototype.findDockForBuild = function (contextVersion, context, cb) {
  var logData = {
    tx: true,
    contextVersion: contextVersion,
    context: context
  }
  log.info(logData, 'Mavis.prototype.findDockForBuild')
  if (!isObject(contextVersion)) {
    log.warn(logData, 'findDockForBuild: !isObject contextVersion')
    return cb(new Error('missing contextVersion'))
  }
  if (!isObject(context)) {
    log.warn(logData, 'findDockForBuild: !isObject context')
    return cb(new Error('missing context'))
  }
  // tag must be a string
  var tags = context.owner.github + ',build'
  var opts = {
    type: 'container_build',
    tags: tags
  }
  opts.prevDuration = contextVersion.duration || 0
  opts.prevImage = contextVersion.dockerTag || null
  this.findDock(opts, cb)
}

Mavis.prototype.findDockForContainer = function (contextVersion, cb) {
  var logData = {
    tx: true,
    contextVersion: contextVersion
  }
  log.info(logData, 'Mavis.prototype.findDockForContainer')
  if (!isObject(contextVersion)) {
    log.warn(logData, 'findDockForContainer: !isObject contextVersion')
    return cb(new Error('missing contextVersion'))
  } else if (!keypather.get(contextVersion, 'owner.github')) {
    log.warn(logData, 'findDockForContainer: contextVersion missing owner')
    return cb(new Error('missing contextVersion owner'))
  }
  // tag must be a string
  var tags = contextVersion.owner.github + ',run'
  var opts = {
    type: 'container_run',
    tags: tags
  }
  // if dockerHost is not an address, its invalid
  opts.prevDock = contextVersion.dockerHost || null
  this.findDock(opts, cb)
}

/**
 * ask mavis for dock to run provided task on
 * @param taskType: ['container_build', 'container_run']
 * @param prevDock: previous dock this image was run on
 * @param cb: Callback
 */
Mavis.prototype.findDock = function (opts, cb) {
  var logData = {
    opts: opts,
    tx: true
  }
  log.info(logData, 'Mavis.prototype.findDock')
  var self = this
  this.post('dock', {
    json: opts
  }, function (err, res) {
    // For logging purposes
    if (keypather.get(res, 'body')) {
      logData.resBody = res.body
    }

    if (err) {
      log.error(put({
        err: err
      }, logData), 'findDock: this.post error')
      var boomErr = Boom.create(504, 'Unable to find dock', {
        mavis: {
          uri: self.host + '/dock'
        },
        err: err
      })
      cb(boomErr)
    } else if (res.statusCode === 503 && opts.tags !== 'default') {
      log.warn(logData, 'findDock: this.post elseif 503 error')
      // if no docks and non default tag, try with default tag
      opts.tags = 'default'
      self.findDock(opts, cb)
    } else if (res.statusCode >= 300) {
      log.warn(logData, 'findDock: this.post elseif >=300 error')
      cb(responseErr(res))
    } else {
      log.trace(logData, 'findDock: success')
      cb(null, res.body.dockHost)
    }
  })
}

function responseErr (res) {
  log.info({tx: true, res: res}, 'models/apis/mavis responseErr')
  var message
  var code
  if (res.statusCode >= 500) {
    message = 'Unknown error from mavis'
    code = res.statusCode === 500
      ? 502
      : res.statusCode
  } else if (res.statusCode >= 400) {
    message = 'Bad request error from mavis'
    code = res.statusCode
  } else if (res.statusCode >= 300) {
    // mavis doesnt send redirects... so this is unexpected
    message = 'Unexpected response from mavis'
    code = 502
  }
  if (res.body && res.body.message) {
    message += ': ' + res.body.message
  }
  return Boom.create(code, message, {
    mavis: {
      uri: res.request.uri,
      statusCode: res.statusCode,
      info: res.body
    }
  })
}

// promisifyAll at the end of file
bluebird.promisifyAll(Mavis)
bluebird.promisifyAll(Mavis.prototype)
