'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var me = require('middlewares/me');
var instances = require('mongooseware')(require('models/mongo/instance'));
var checkFound = require('middlewares/check-found');
var keypather = require('keypather')();

app.all('/instances/:id/dependencies*',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator));

app.get('/instances/:id/dependencies',
  mw.query('hostname').pick(),
  mw.query('hostname').require().then(
    mw.query('hostname').string(),
    mw.query().set('hostname', 'query.hostname.toLowerCase()')),
  instances.model.getDependencies('query').exec('dependencies'),
  function (req, res, next) {
    req.instanceIds = req.dependencies.map(function (d) {
      return d.id;
    });
    req.groupedDependencies = groupBy(req.dependencies, 'id');
    next();
  },
  instances.findByIds('instanceIds').exec('instances'),
  function (req, res, next) {
    req.instances.forEach(function (i) {
      i.hostname = req.groupedDependencies[i.id][0].hostname;
    });
    next();
  },
  mw.res.send(200, 'instances'));

app.post('/instances/:id/dependencies',
  mw.body('instance').require().string(),
  mw.body('hostname')
    .require().string().matches(new RegExp('.+\.' + process.env.USER_CONTENT_DOMAIN + '$')),
  mw.body().set('hostname', 'body.hostname.toLowerCase()'),
  instances.findOneByShortHash('body.instance').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.addDependency('dependantInstance', 'body.hostname').exec('shortInstance'),
  mw.req().set('dependantInstance.hostname', 'shortInstance.hostname'),
  mw.res.send(201, 'dependantInstance'));

app.delete('/instances/:id/dependencies/:dependency',
  instances.findOneByShortHash('params.dependency').exec('dependantInstance'),
  checkFound('dependantInstance'),
  instances.model.removeDependency('dependantInstance'),
  mw.res.send(204));

function groupBy (arr, keypath) {
  var grouped = {};
  arr.forEach(function (item) {
    var val = keypather.get(item, keypath);
    grouped[val] = grouped[val] || [];
    grouped[val].push(item);
  });
  return grouped;
}
