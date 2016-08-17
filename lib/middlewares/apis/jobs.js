/**
 * used to format and send jobs
 * @module lib/middlewares/apis/jobs
 */
'use strict'

var Boom = require('dat-middleware').Boom
var error = require('error')
var put = require('101/put')
var rabbitMQ = require('models/rabbitmq')
var Github = require('models/apis/github')

var dogstatsd = require('models/datadog')
var log = require('middlewares/logger')(__filename).log

module.exports.publishASGCreate = publishASGCreate

/**
 * get orgId and publish job to create cluster
 * @param  {object}   req  express request object
 *                    req.name: org/user name which is white listed
 * @param  {object}   res  express response
 * @param  {Function} next express next
 */
function publishASGCreate (req, res, next) {
  dogstatsd.increment('api.asg.create', 1)
  var name = req.body.name
  var logData = {
    name: name
  }
  log.info(logData, 'publishASGCreate')
  var github = new Github()
  github.getUserByUsername(name, function (err, userData) {
    if (err || !userData) {
      err = err || Boom.badRequest('userData not found')
      error.log(err, req)
      log.error(put({
        err: err,
        userData: userData
      }, logData), 'publishASGCreate: getUserByUsername error')
      return next(err)
    }
    rabbitMQ.publishASGCreate({
      githubId: userData.id.toString()
    })
    next()
  })
}
