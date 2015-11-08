/**
 * Error reporting module
 * @module lib/error
 */
'use strict'

var Boom = require('dat-middleware').Boom
var envIs = require('101/env-is')
var extend = require('extend')
var find = require('101/find')
var keypather = require('keypather')()
var noop = require('101/noop')
var assign = require('101/assign')
var pick = require('101/pick')
var rollbar = require('rollbar')

var logger = require('middlewares/logger')(__filename)
var log = logger.log

if (process.env.ROLLBAR_KEY) {
  rollbar.init(process.env.ROLLBAR_KEY, {
    branch: process.env._VERSION_GIT_BRANCH,
    codeVersion: process.env._VERSION_GIT_COMMIT,
    environment: process.env.NODE_ENV || 'development',
    root: process.env.ROOT_DIR
  })
}

var error = module.exports = function (code, msg, data) {
  return Boom.create(code, msg, data)
}

function logFn (err) {
  var custom = err.data || {}
  var errorData = {
    tx: true,
    stack: err.stack,
    message: err.message
  }
  if (custom.report === false) { return }
  if (err.data) {
    if (err.data.err) {
      errorData.customerErr = pick(err.data.err, ['message', 'stack'])
      logger.log.error(errorData, 'log original error')
    }
    if (err.data.docker) {
      errorData = assign(errorData, pick(err.data.docker,
        ['host', 'port', 'cmd', 'containerId', 'log']))
      logger.log.error(errorData, 'log docker error')
    }
    if (err.data.krain) {
      errorData = assign(errorData, pick(err.data.krain, ['uri', 'statusCode', 'info']))
      logger.log.error(errorData, 'log krain error')
    }
    if (err.data.mavis) {
      errorData = assign(errorData, pick(err.data.mavis, ['uri', 'statusCode', 'info']))
      logger.log.error(errorData, 'log mavis error')
    }
    if (err.data.s3) {
      errorData = assign(errorData, pick(err.data.s3,
        ['bucket', 'contextId', 'sourcePath', 'sourceUrl']))
      logger.log.error(errorData, 'log s3 error')
    }
    if (err.data.res) {
      errorData = assign(errorData, pick(err.data.res, ['body', 'statusCode']))
      logger.log.error(errorData, 'log http response error')
    }
    if (err.data.debug) {
      errorData = assign(errorData, pick(err.data.debug, ['debug']))
      logger.log.error(errorData, 'log debug error')
    }
  }
  if (!envIs('test')) {
    report(err)
  }
}

function report (err) {
  logger.log.error({
    tx: true,
    err: err
  }, 'report')
  var custom = err.data || {}
  if (custom.report === false) { return } // don't report this error
  var req = custom.req
  delete custom.req
  if (custom.err) {
    var errKeys
    try {
      errKeys = Object.keys(custom.err)
    } catch (err) {
      errKeys = []
    }
    custom.err = pick(custom.err, [ 'message', 'stack' ].concat(errKeys))
  }
  var payload = {
    custom: custom
  }
  if (custom.level) {
    payload.level = custom.level
    delete custom.level
  }
  var person = createPerson(err, req)
  if (person && req) {
    req.rollbar_person = person // eslint-disable-line camelcase
  }
  rollbar.handleErrorWithPayloadData(err, payload, req, noop)
}

error.log = function (err, req) {
  // if req was not passed look for it in domain members
  req = req || findReqFromDomain()
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err })
    err.reformat()
  }
  if (process.env.LOG_ERRORS) {
    if (!req || !req.url || !req.method) {
      req = null
    }
    var statusCode = err.output.statusCode
    if (statusCode >= 500) {
      logger.log.error({
        tx: true,
        statusCode: statusCode,
        url: req ? req.url : 'unknown url',
        method: req ? req.method : 'unknown method'
      }, 'error log bad app error')
    } else {
      logger.log.error({
        tx: true,
        statusCode: statusCode,
        message: err.message,
        url: req ? req.url : 'unknown url',
        method: req ? req.method : 'unknown method'
      }, 'error log acceptable app error')
    }
    if (!envIs('test') || statusCode >= 500) {
      err.data = err.data || {}
      err.data.req = req
      logFn(err)
    }
  }
}

error.logIfErrMw = function (err, req, res, next) {
  error.log(err, req)
  next()
}

error.logIfErr = function (err, req) {
  if (err) {
    error.log(err, req)
  }
}

/**
 * Extract error from key on req object & log
 * @param {String} keypath
 * @return {Function} middleware
 */
error.logKeypathMw = function (keypath) {
  return function (req, res, next) {
    var err = keypather.get(req, keypath)
    error.logIfErr(err, req)
    next()
  }
}

error.wrapIfErr = function (cb, status, message, data) {
  return function (err) {
    var errData = {}
    if (err && err.isBoom) {
      errData = err.data || { err: err }
    } else {
      errData = { err: err }
    }
    if (err) {
      extend(errData, data)
      cb(Boom.create(status, message, errData))
    } else {
      cb.apply(this, arguments)
    }
  }
}

function createPerson (err, req) {
  var user = err.user
  if (!user && req) {
    user = req.sessionUser || req.user
  }
  if (!user) {
    return null
  }
  var person = {
    id: user._id,
    email: user.email,
    username: keypather.get(user, 'accounts.github.username')
  }
  return person
}

/**
 * errorHandler middlewares
 */
var inflect = require('i')()

error.errorCaster = function (err, req, res, next) {
  if (err instanceof Error) {
    next(err)
  } else {
    try {
      err = new Error(JSON.stringify(err))
    } catch (stringifyErr) {
      err = new Error('' + err)
    }
    next(err)
  }
}

error.mongooseErrorCaster = function (err, req, res, next) {
  function handMongoError (err) {
    if (error.isMongoAlreadyExistsError(err)) {
      var resourceAliases = {
        me: 'user'
      }
      var fieldAliases = {
        aliases: 'name',
        lowerUsername: 'username'
      }
      var match = /([^.]+).\$([^_]+)_/.exec(err.err)
      var resource = inflect.singularize(match[1])
      resource = resourceAliases[resource] || resource
      var field = fieldAliases[match[2]] || match[2]
      var message = resource + ' with ' + field + ' already exists'
      err = error(409, message, { err: err })
    }
    return err
  }
  function handValidationError (err) {
    var note = Object.keys(err.errors).map(function (key) {
      return err.errors[key].message
    }).join('\n')
    err = error(400, note, { err: err })
    return err
  }

  if (err.name === 'MongoError') {
    err = handMongoError(err)
  } else if (err.name === 'ValidationError') {
    err = handValidationError(err)
  }
  next(err)
}

error.sendIf400Error = function (err, req, res, next) {
  // only 401s and 404s for now bc they are spammy
  // continue to track 404s on container pages for analytics purposes
  if (err.isBoom && err.output.statusCode === 401) {
    err.reformat()
    res.status(err.output.statusCode).json(err.output.payload)
  } else {
    next(err)
  }
}

/* jshint unused:false */ // middleware arguments length matters
error.errorHandler = function (err, req, res, next) { // eslint-disable-line no-unused-vars
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err })
  }
  err.reformat()
  if (process.env.LOG_ERRORS) {
    error.log(err, req)
  }
  // make sure error has not occurred after response has already been sent
  if (!res.headersSent) {
    // TODO: throw error then catch and drain server
    // if (err.output.statusCode === 500) {
    //   throw err
    // }
    assign(err.output.payload, pick(err.data, ['errorCode']))
    res.status(err.output.statusCode).json(err.output.payload)
  }
}

/**
 * Handle errors originating in socket event listeners
 * Data emitted with 'error' key will be handled (logged)
 * by frontend
 * @param {Error} err
 * @param {Object} spark
 */
error.socketErrorHandler = function (err, spark) {
  if (process.env.LOG_ERRORS) {
    error.log(err, spark)
  }
  spark.write({
    error: err.message
  })
}

/**
 * Handle error originating from workers.
 * Must ack worker task to avoid infinite loop of
 * rabbitmq redelivery.
 */
error.workerErrorHandler = function (err, data) {
  log.warn({
    tx: true,
    err: err
  }, 'error.workerErrorHandler')
  if (process.env.LOG_ERRORS) {
    error.log(err)
    rollbar.handleErrorWithPayloadData(error, {
      data: data
    })
  }
}

/* jshint unused:true */
error.isMongoAlreadyExistsError = function (err) {
  return err.code === 11000 || err.code === 11001
}

// helpers
function findReqFromDomain () {
  if (keypather.get(process, 'domain.members.length')) {
    var found = find(process.domain.members, function (member) {
      return Boolean(member.req)
    })
    return found && found.req
  }
}
