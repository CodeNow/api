/**
 * @module lib/middlewares/domains
 */
'use strict'

var cluster = require('cluster')
var defaults = require('101/defaults')
var domain = require('domain')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var shimmer = require('shimmer')
var uuid = require('uuid')

var error = require('error')
var log = require('middlewares/logger')(__filename).log

/**
 * Wrap request handlers w/ domains for error handling
 */
module.exports = function (req, res, next) {
  var d = domain.create()
  req.domain = d
  d.runnableData = getRunnableData(req)
  d.add(req)
  d.add(res)
  if (!res._headers[process.env.TID_RESPONSE_HEADER_KEY]) {
    res.setHeader(process.env.TID_RESPONSE_HEADER_KEY,
      keypather.get(req.domain, 'runnableData.tid'))
  }
  d.run(function () {
    /**
     * Allow frontend to access header value for error reporting
     */
    res.setHeader('Access-Control-Expose-Headers', process.env.TID_RESPONSE_HEADER_KEY)
    /**
     * monkey-patch send w/ logging
     * Will log final queryable log when response sent for any HTTP request
     */
    shimmer.wrap(res, 'send', function (original) {
      return function () {
        log.info({
          tx: true
        }, 'middlewares/domains res.send')
        original.apply(this, arguments)
      }
    })
    log.info({
      tx: true
    }, 'middlewares/domains request init')
    next()
  })
}

/**
 * Set domain properties after session initialized
 */
module.exports.updateDomain = function (req, res, next) {
  var runnableData = getRunnableData(req)
  if (req.domain) {
    req.domain.runnableData = runnableData
  }
  next()
}

/**
 * Append user data to runnableData
 */
function getRunnableData (req) {
  var runnableData = keypather.get(process, 'domain.runnableData')
  if (!isObject(runnableData)) {
    runnableData = {
      tid: uuid.v4(),
      url: req.method.toUpperCase() + ' ' + req.url,
      reqStart: new Date(),
      reqBody: req.body
    }
  }
  defaults(runnableData, {
    userGithubUsername: keypather.get(req, 'sessionUser.accounts.github.username'),
    userGithubId: keypather.get(req, 'sessionUser.accounts.github.id'),
    userGithubEmail: keypather.get(req, 'sessionUser.email')
  })
  return runnableData
}
