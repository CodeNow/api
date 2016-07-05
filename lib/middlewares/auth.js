'use strict'

var Boom = require('dat-middleware').Boom
var flow = require('middleware-flow')
var keypather = require('keypather')()
var UserWhitelist = require('models/mongo/user-whitelist')

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

/**
 * Require that the user is part of a whitelisted organization
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next callback
 * @throws {Boom.unauthorized} When missing github access token
 * @throws {Boom.unauthorized} When not part of an org that's been setup yet
 * @returns {Promise}
 * @resolves {null}
 */
function requireWhitelist (req, res, next) {
  return UserWhitelist.getWhitelistedUsersForGithubUserAsync(keypather.get(req, 'sessionUser.accounts.github.accessToken'))
    .catch(function (err) {
      // If no access token then we may not be logged in, or we may have an invalid session
      // log them out so we can reset
      if (err.message === 'An access token must be provided') {
        req.logout()
        throw Boom.unauthorized('Github access token is required')
      }
      throw err
    })
    .then(function (whitelistedOrgs) {
      if (!whitelistedOrgs || whitelistedOrgs.length === 0) {
        throw Boom.unauthorized('You are not part of an organization that has been setup yet')
      }
    })
    .asCallback(function (err) {
      next(err)
    })
}

module.exports = {
  requireAuth: flow.or(
    allowExceptions,
    validate
  ),
  requireWhitelist: requireWhitelist
}
