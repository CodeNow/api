'use strict';

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var instances = require('mongooseware')(require('models/mongo/instance'));
var checkFound = require('middlewares/check-found');
var me = require('middlewares/me');
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable');
var validations = require('middlewares/validations');

app.all('/instances/:id/masterPod',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    ownerIsHelloRunnable('instance'),
    me.isModerator));

app.get('/instances/:id/masterPod',
  mw.req('instance.masterPod').validate(validations.equals(true)).then(
    mw.res.send(204)
  ).else(
    mw.res.send(404)
  ));

app.put('/instances/:index/masterPod',
  mw.req('body')
    .require()
    .validate(validations.isPopulatedArray)
    .validate(validations.isArrayOf('boolean')),
  instances.model.update({ 'masterPod': 'body[0]' }),
  mw.res.send(204));

app.delete('/instances/:id/masterPod',
  instances.model.update({ 'masterPod': false }),
  mw.res.send(204));
