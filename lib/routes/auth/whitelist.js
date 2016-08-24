'use strict'

/** @module lib/routes/auth/whitelist */

var Boom = require('dat-middleware').Boom
const errors = require('errors')
var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var keypather = require('keypather')()

var UserService = require('models/services/user-service')
var OrganizationService = require('models/services/organization-service')

function addUnderscoreIdToOrg (org) {
  org._id = org.id
  return org
}

/** a route to get all whitelisted orgs for a specific user
 *  @event GET rest/auth/whitelist/
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/',
  function (req, res, next) {
    UserService.getUsersOrganizationsWithGithubModel(req.sessionUser)
      .map(addUnderscoreIdToOrg)
      .then(function (orgs) {
        res.status(200).json(orgs)
      })
      .catch(errors.UserNotFoundError, function (err) {
        next(Boom.notFound('User could not be found', {
          originalError: err
        }))
      })
      .catch(function (err) {
        next(err)
      })
  })

/** add a name to the whitelist
 *  @params body.name name of the user or org
 *  @event POST rest/auth/whitelist
 *  @memberof module:lib/routes/auth/whitelist */

app.post('/auth/whitelist',
  function (req, res, next) {
    var orgName = keypather.get(req, 'body.name')
    OrganizationService.create(orgName, req.sessionUser)
      .then(function () {
        res.status(201).json({ success: true }) // Enqueues worker
      })
      // TODO: Nathan, is going to remove this stupid function
      .catch(function (err) {
        next(err)
      })
  }
)

/** a route to check if a name exists
 *  (so we don't have to go to the database or do weird things)
 *  @params params.name name of the user or org
 *  @event GET rest/auth/whitelist/:name
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/:name',
  mw.params('name').pick().require().string(),
  function (req, res, next) {
    UserService.getUsersOrganizations(req.sessionUser)
      .then(function (orgs) {
        return orgs.find(function (org) {
          return org.lowerName === 'runnable' || org.lowerName === 'codenow'
        })
      })
      .then(function (isRunnable) {
        if (!isRunnable) { throw Boom.unauthorized('You are not allowed to access this route') }
        var name = keypather.get(req, 'params.name')
        return OrganizationService.getByGithubUsername(name)
      })
      .then(function () {
        res.status(204).send()
      })
      .catch(errors.OrganizationNotFoundError, function (err) {
        throw Boom.notFound('Organization could not be found', {
          originalError: err
        })
      })
      .catch(function (err) {
        next(err)
      })
  })

