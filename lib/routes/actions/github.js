/**
 * Github API Hooks
 * @module rest/actions/github
 */
'use strict'

var express = require('express')
var app = module.exports = express()

var NotImplementedException = require('errors/not-implemented-exception.js')
var Promise = require('bluebird')
var WebhookService = require('models/services/webhook-service')

var monitor = require('monitor-dog')
var Boom = require('dat-middleware').Boom

/**
 * When a webhook request comes in, we need to validate that the message is a valid Github hook, then
 * process it.  This validates the message, verifies the hooks are enabled, then processes it.  It
 * return either a 200 if everything was successful, 202 if no action, or the error returned from the
 * processing
 *
 * @param {Object}   req  - request object
 * @param {Object}   res  - response object
 *
 * @returns  {Promise}         Resolves when the successful response has been sent
 * @resolves {Null}
 * @throws   {Boom.badRequest} When the headers are not valid
 */
var onGithookEvent = Promise.method(function (req, res) {
  reportDatadogEvent(req)
  if (!areHeadersValidGithubEvent(req.headers)) {
    throw Boom.badRequest('Invalid githook')
  }
  if (/^ping$/.test(req.get('x-github-event'))) {
    return res.status(202).send('Hello, Github Ping!')
  }
  if (!process.env.ENABLE_GITHUB_HOOKS) {
    return res.status(202).send('Hooks are currently disabled, but we gotchu!')
  }
  if (!/^push$/.test(req.get('x-github-event'))) {
    return res.status(202).send('No action set up for that payload.')
  }
  return WebhookService.processGithookEvent(req.body)
    .then(function () {
      res.status(200).send('Success')
    })
    .catch(NotImplementedException, function (err) {
      res.status(202).send(err.message)
      // DON'T RETHROW
    })
})

/**
 * Validates the headers from the GitHook to make sure it's a valid event
 *
 * @param   {Headers} headers - header from the request
 *
 * @returns {Boolean} false if the event is invalid for our githook logic
 */
function areHeadersValidGithubEvent (headers) {
  if (!headers) {
    return false
  }
  if (!/^GitHub.*$/.test(headers['user-agent'])) {
    return false
  }
  return !!(headers['x-github-event'] && headers['x-github-delivery'])
}

/**
 * Middlware step to report what type of Github POSTback event
 * recieve to datadog
 * @return null
 */
function reportDatadogEvent (req) {
  var eventName = req.get('x-github-event') || ''
  monitor.increment('api.actions.github.events', ['event:' + eventName])
}

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/actions/github/', function (req, res, next) {
  onGithookEvent(req, res)
    .catch(function (err) {
      // we don't want successful routes to call next, since we already sent the response
      next(err)
    })
})

module.exports.areHeadersValidGithubEvent = areHeadersValidGithubEvent
module.exports.onGithookEvent = onGithookEvent
module.exports.reportDatadogEvent = reportDatadogEvent
