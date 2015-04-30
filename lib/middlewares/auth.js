'use strict';

var Boom = require('dat-middleware').Boom;
var flow = require('middleware-flow');
var keypather = require('keypather')();
var isInternalRequest = require('middlewares/is-internal-request');

function allowExceptions (req, res, next) {
  // unauthorized requests GET /instances for
  // fetching seed instances on getting-started homepage
  var ownerGithubId = parseInt(keypather.get(req.query, 'owner.github'));
  if (/^\/instances$/i.test(req.path) &&
      ownerGithubId === parseInt(process.env.HELLO_RUNNABLE_GITHUB_ID) &&
      req.method === 'GET') {
    next();
  }
  else {
    next(Boom.unauthorized('Unauthorized'));
  }
}

function validate (req, res, next) {
  if (!req.sessionUser) {
    next(Boom.unauthorized('Unauthorized'));
  }
  else {
    next();
  }
}

module.exports = {
  requireAuth: flow.or(
    isInternalRequest,
    allowExceptions,
    validate
  )
};
