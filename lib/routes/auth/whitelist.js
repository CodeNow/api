'use strict'

/** @module lib/routes/auth/whitelist */

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var flow = require('middleware-flow')
var checkFound = require('middlewares/check-found')

var userWhitelist = require('mongooseware')(require('models/mongo/user-whitelist'))
var github = require('middlewarize')(require('models/apis/github'))
var jobs = require('middlewares/apis/jobs')

app.all('/auth/whitelist*',
  // only allow people in the Runnable team add people
  github.new({ token: 'sessionUser.accounts.github.accessToken' }),
  flow.or(
    github.instance.isOrgMember('Runnable', 'cb'),
    github.instance.isOrgMember('CodeNow', 'cb')))

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
  mw.body('name').pick(),
  mw.body('name').require().string(),
  userWhitelist.create({
    name: 'body.name',
    allowed: true
  }),
  jobs.publishASGCreate,
  mw.res.json(201, 'userwhitelist'))

/** a route to check if a name exists
 *  (so we don't have to go to the database or do weird things)
 *  @params params.name name of the user or org
 *  @event GET rest/auth/whitelist/:name
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/:name',
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
