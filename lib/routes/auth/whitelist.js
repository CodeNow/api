'use strict'

/** @module lib/routes/auth/whitelist */

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var flow = require('middleware-flow')
var checkFound = require('middlewares/check-found')
var keypather = require('keypather')()

var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'))
var whitelistService = require('models/services/whitelist-service')
var github = require('middlewarize')(require('models/apis/github'))

var isCodeNowOrRunnableUser = flow.or(
  github.instance.isOrgMember('Runnable', 'cb'),
  github.instance.isOrgMember('CodeNow', 'cb'))

/** a route to get all whitelisted orgs for a specific user
 *  @event GET rest/auth/whitelist/
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/',
  userWhitelist.getWhitelistedUsersForGithubUser('sessionUser.accounts.github.accessToken'),
  checkFound('userwhitelists'),
  mw.res.json(200, 'userwhitelists'))

/** add a name to the whitelist
 *  @params body.name name of the user or org
 *  @event POST rest/auth/whitelist
 *  @memberof module:lib/routes/auth/whitelist */

app.post('/auth/whitelist',
  function (req, res, next) {
    whitelistService.createWhitelist(keypather.get(req, 'body.name'), req.sessionUser)
      .then(function () {
        res.send(201)
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
  github.new({ token: 'sessionUser.accounts.github.accessToken' }),
  isCodeNowOrRunnableUser,
  mw.params('name').pick().require().string(),
  userWhitelist.findOne({
    lowerName: 'params.name.toLowerCase()'
  }),
  checkFound('userwhitelist'),
  mw.res.send(204))

/** remove a name from the whitelist
 *  @params param.name name of the user or org
 *  @event DELETE rest/auth/whitelist/:name
 *  @memberof module:lib/routes/auth/whitelist */
app.delete('/auth/whitelist/:name',
  github.new({ token: 'sessionUser.accounts.github.accessToken' }),
  isCodeNowOrRunnableUser,
  mw.params('name').pick(),
  mw.params('name').require().string(),
  userWhitelist.findOne({
    lowerName: 'params.name.toLowerCase()'
  }),
  checkFound('userwhitelist'),
  userWhitelist.remove({
    _id: 'userwhitelist._id'
  }),
  mw.res.send(204))
