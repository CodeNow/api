'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var me = require('middlewares/me');
var instances = require('mongooseware')(require('models/mongo/instance'));
var checkFound = require('middlewares/check-found');
var transformations = require('middlewares/transformations');

app.all('/instances/:id/dependencies*',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator));

app.get('/instances/:id/dependencies',
  mw.query('hostname', 'recurse', 'flat').pick(),
  mw.query('recurse', 'flat').mapValues(transformations.setDefault(false)),
  mw.query('hostname').require().then(
    mw.query('hostname').string(),
    mw.query().set('hostname', 'query.hostname.toLowerCase()')),
  instances.model.getDependencies('query').exec('dependencies'),
  mw.res.send(200, 'dependencies'));

app.post('/instances/:id/dependencies',
  mw.body('instance').require().string(),
  mw.body('hostname')
    .require().string().matches(new RegExp('.+\.' + process.env.USER_CONTENT_DOMAIN + '$')),
  mw.body().set('hostname', 'body.hostname.toLowerCase()'),
  instances.findOneByShortHash('body.instance').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.addDependency('dependantInstance', 'body.hostname').exec('shortInstance'),
  mw.res.send(201, 'shortInstance'));

app.delete('/instances/:id/dependencies/:dependency',
  instances.findOneByShortHash('params.dependency').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.removeDependency('dependantInstance'),
  mw.res.send(204));

