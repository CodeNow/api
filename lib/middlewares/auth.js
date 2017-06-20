'use strict'

const Boom = require('dat-middleware').Boom
const flow = require('middleware-flow')
const keypather = require('keypather')()
const User = require('models/mongo/user')
const UserService = require('models/services/user-service')

function isHelloRunnable (ownerGithubId) {
  return ownerGithubId === parseInt(process.env.HELLO_RUNNABLE_GITHUB_ID, 10)
}
function allowExceptions (req, res, next) {
  // unauthorized requests GET /instances for
  // fetching seed instances on getting-started homepage
  var ownerGithubId = parseInt(keypather.get(req.query, 'owner.github'), 10)
  if (/^\/instances$/i.test(req.path) && isHelloRunnable(ownerGithubId) && req.method === 'GET') {
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
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next callback
 * @throws {Boom.unauthorized} When missing github access token
 * @throws {Boom.unauthorized} When not part of an org that's been setup yet
 * @returns {Promise}
 * @resolves {null}
 */
function requireWhitelist (req, res, next) {
  if (isHelloRunnable(keypather.get(req, 'sessionUser.accounts.github.id'))) {
    return next()
  }
  return UserService.getUsersOrganizations(keypather.get(req, 'sessionUser'))
    .then(function (orgs) {
      if (!orgs || orgs.length === 0) {
        throw Boom.unauthorized('You are not part of an organization that has been setup yet')
      }
    })
    .catch(User.NotFoundError, function () {
      throw Boom.unauthorized('You are not a user in our system')
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
