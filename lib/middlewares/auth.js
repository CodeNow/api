'use strict';

var Boom = require('dat-middleware').Boom;
var flow = require('middleware-flow');
var keypather = require('keypather')();

function allowExceptions (req, res, next) {
  // unauthorized requests GET /instances
  if (/^\/instances$/i.test(req.path) &&
      keypather.get(req.query, 'owner.github') === process.env.HELLO_RUNNABLE_GITHUB_ID &&
      req.route.methods.get) {
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
    allowExceptions,
    validate
  )
};
