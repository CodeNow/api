'use strict'

var Boom = require('dat-middleware').Boom
var flow = require('middleware-flow')
var keypather = require('keypather')()

function allowExceptions (req, res, next) {
  // unauthorized requests GET /instances for
  // fetching seed instances on getting-started homepage
  var ownerGithubId = parseInt(keypather.get(req.query, 'owner.github'), 10)
  if (/^\/instances$/i.test(req.path) &&
    ownerGithubId === parseInt(process.env.HELLO_RUNNABLE_GITHUB_ID, 10) &&
    req.method === 'GET') {
    next()
  } else {
    next(Boom.unauthorized('Unauthorized'))
  }
}

function validate (req, res, next) {
  if (!req.sessionUser) {
    next(Boom.unauthorized('Unauthorized'))
  } else {
    next()
  }
}

module.exports = {
  requireAuth: flow.or(
    allowExceptions,
    validate
  )
}
