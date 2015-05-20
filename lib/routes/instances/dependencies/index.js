'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var me = require('middlewares/me');
var instances = require('mongooseware')(require('models/mongo/instance'));
var checkFound = require('middlewares/check-found');
var transformations = require('middlewares/transformations');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');

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

var endsWithUserContentDomain = new RegExp('.+[.]' + process.env.USER_CONTENT_DOMAIN + '$', 'i');
app.put('/instances/:id/dependencies/:hostname',
    mw.body('instance').require().string(),
    mw.body('hostname')
      .require().string().matches(endsWithUserContentDomain),
    instances.findOneByShortHash('body.instance').exec('dependantInstance'),
    checkFound('dependantInstance'),
    instances.model.getDependencies({}).exec('dependencies'),
    function (req, res, next) {
      req.existingDep = find(req.dependencies || [], hasKeypaths({
        'hostname.toLowerCase()': req.hostname.toLowerCase()
      }));
      next();
    },
    // FIXME: this should be atomic
    mw.req('existingDep').require()
      .then(
        // remove existing if one exists
        instances.findById('existingDep.instance').exec('existingInstance'),
        checkFound('existingInstance'),
        instances.model.removeDependency('existingInstance')
      ),
    // add dependency
    instances.model.addDependency('dependantInstance', 'body.hostname').exec('shortInstance'),
    mw.res.send(200, 'shortInstance')
  );