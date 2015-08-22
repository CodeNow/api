'use strict';

var express = require('express');
var app = module.exports = express();

var debugContainer = require('mongooseware')(require('models/mongo/debug-container'));
var instance = require('mongooseware')(require('models/mongo/instance'));
var mw = require('dat-middleware');
var checkFound = require('middlewares/check-found');
var async = require('async');

app.get('/debug-containers',
  mw.query('instance').pick().string().require(),
  debugContainer.find('query'),
  function (req, res, next) {
    async.each(
      req.debugcontainers,
      function (dc, cb) {
        dc.populate([ 'instance', 'contextVersion' ], cb);
      },
      next);
  },
  mw.res.json('debugcontainers'));

app.post('/debug-containers',
  mw.body('instance', 'contextVersion', 'layerId').pick().string().require(),
  instance.findOne({ _id: 'query.instance' }),
  checkFound('instance'),
  function (req, res, next) {
    // save the owner of the debug container from the instance
    req.body.owner = { github: req.instance.owner.github };
    next();
  },
  debugContainer.new('body'),
  debugContainer.model.save(),
  function (req, res, next) {
    req.debugcontainer.populate([ 'instance', 'contextVersion' ], next);
  },
  debugContainer.model.deploy(),
  mw.res.json(201, 'debugcontainer'));

app.get('/debug-containers/:id',
  mw.params('id').pick().require(),
  debugContainer.findOne('params'),
  mw.res.json(200, 'debugcontainers'));

app.delete('/debug-containers/:id',
  mw.params('id').pick().require(),
  debugContainer.findOne('params'),
  checkFound('debugcontainer', 'Debug Container not found'),
  function (req, res, next) {
    req.debugcontainer.populate(['contextVersion'], next);
  },
  debugContainer.model.destroyContainer(),
  debugContainer.model.remove(),
  mw.res.status(204));
