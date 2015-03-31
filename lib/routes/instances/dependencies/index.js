'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var me = require('middlewares/me');
var instances = require('mongooseware')(require('models/mongo/instance'));
var checkFound = require('middlewares/check-found');

app.all('/instances/:id/dependencies*',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator));

app.get('/instances/:id/dependencies',
  mw.query('hostname', 'contextVersion.context').pick(),
  mw.query('hostname').require().then(mw.query('hostname').string()),
  instances.model.getDependencies('query').exec('dependencies'),
  mw.query('["contextVersion.context"]').require().then(
    function (req, res, next) {
      req.dependencies = req.dependencies.filter(function (dependency) {
        return dependency.contextVersion.context ===
          req.query['contextVersion.context'];
      });
      next();
    }
  ),
  mw.res.send(200, 'dependencies'));

app.post('/instances/:id/dependencies',
  mw.body('instance').require().string(),
  mw.body('hostname')
    .require().string().matches(new RegExp('.+' + process.env.USER_CONTENT_DOMAIN)),
  instances.findOneByShortHash('body.instance').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.addDependency('dependantInstance', 'body.hostname').exec('shortInstance'),
  mw.res.send(201, 'shortInstance'));

app.delete('/instances/:id/dependencies/:dependency',
  instances.findOneByShortHash('params.dependency').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.removeDependency('dependantInstance'),
  mw.res.send(204));
