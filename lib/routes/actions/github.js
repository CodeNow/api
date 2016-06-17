/**
 * Github API Hooks
 * @module rest/actions/github
 */
'use strict'

var express = require('express')
var app = module.exports = express()

var NotImplementedException = require('errors/not-implemented-exception.js')
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
 * @param {Function} next - callback function
 *
 * @returns {null}
 */
function onGithookEvent (req, res, next) {
  reportDatadogEvent(req)
  if (!areHeadersValidGithubEvent(req.headers)) {
    return next(Boom.badRequest('Invalid githook'), res)
  }
  if (/^ping$/.test(req.get('x-github-event'))) {
    return next(null, res.status(202).send('Hello, Github Ping!'))
  }
  if (!process.env.ENABLE_GITHUB_HOOKS) {
    return next(null, res.status(202).send('Hooks are currently disabled, but we gotchu!'))
  }
  if (!/^push$/.test(req.get('x-github-event'))) {
    return next(null, res.status(202).send('No action set up for that payload.'))
  }
  WebhookService.processGithookEvent(req.body)
    .then(function () {
      res.status(200).send('Success')
    })
    .catch(NotImplementedException, function (err) {
      res.status(202).send(err.message)
      // DON'T RETHROW
    })
    .asCallback(function (err) {
      next(err, res)
    })
}

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
app.post('/actions/github/', onGithookEvent)

module.exports.areHeadersValidGithubEvent = areHeadersValidGithubEvent
module.exports.onGithookEvent = onGithookEvent
module.exports.reportDatadogEvent = reportDatadogEvent
