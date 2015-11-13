'use strict'

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var Boom = mw.Boom
var flow = require('middleware-flow')

var checkFound = require('middlewares/check-found')
var instances = require('mongooseware')(require('models/mongo/instance'))
var me = require('middlewares/me')
var transformations = require('middlewares/transformations')

app.all('/instances/:id/dependencies*',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator))

app.get('/instances/:id/dependencies',
  mw.query('hostname', 'recurse', 'flatten').pick(),
  mw.query('recurse', 'flatten').mapValues(transformations.setDefault(false)),
  mw.query('hostname').require().then(
    mw.query('hostname').string(),
    mw.query().set('hostname', 'query.hostname.toLowerCase()')),
  instances.model.getDependencies('query').exec('dependencies'),
  mw.res.send(200, 'dependencies'))

var endsWithUserContentDomain = new RegExp('.+[.]' + process.env.USER_CONTENT_DOMAIN + '$', 'i')
app.put('/instances/:id/dependencies/:hostname',
  mw.body('instance').require().string(),
  mw.body('hostname')
    .require().string().matches(endsWithUserContentDomain),
  instances.findOneByShortHash('body.instance').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.getDependencies({
    hostname: 'body.hostname'
  }).exec('dependencies'),
  // FIXME: this should be atomic
  mw.req('dependencies[0]').require()
    .then(
      mw.req().set('existingDep', 'dependencies[0]'),
      // remove existing if one exists
      instances.findOneByShortHash('existingDep.id').exec('existingInstance'),
      checkFound('existingInstance'),
      instances.model.removeDependency('existingInstance').exec('removed')
  )
    .else(
      mw.next(
        Boom.notFound('existing dependency with hostname not found'))
  ),
  // add dependency
  instances.model.addDependency('dependantInstance', 'body.hostname').exec('shortInstance'),
  instances.model.emitInstanceUpdate('patch'),
  mw.res.send(200, 'shortInstance')
)
