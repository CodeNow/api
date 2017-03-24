/**
 * @module lib/models/redis/hosts
 */
'use strict'

const Boom = require('dat-middleware').Boom
const Promise = require('bluebird')
const keypather = require('keypather')()

const logger = require('middlewares/logger')(__filename)

const log = logger.log

module.exports = Hosts

function Hosts () {}

/**
 * validates the instance hostname into name
 * @param  {string}   hostname  hostname of an instance
 * @param  {Function} cb
 */
Hosts.prototype.validateHostname = function (hostname, cb) {
  log.info({ hostname }, 'Hosts.prototype.validateHostname')
  // validates at least 2 '-' + domain
  const userContentDomainRE = new RegExp('^.*-.*-.*.' + // at least 2 -
    process.env.USER_CONTENT_DOMAIN + '$')
  if (!userContentDomainRE.test(hostname)) {
    return invalidHostname(hostname, 'incorrect user content domain', cb)
  }
  cb()
}

function invalidHostname (hostname, msg, cb) {
  const errorMsg = 'Invalid hostname (ex: name-org.' + process.env.USER_CONTENT_DOMAIN + ')'
  const err = Boom.badRequest(errorMsg, {
    errorCode: 'INVALID_HOSTNAME', // this should not change!
    errorMsg: msg,
    errorHostname: hostname
  })
  keypather.set(err, 'data.report', false)
  cb(err)
}

Promise.promisifyAll(Hosts.prototype)
