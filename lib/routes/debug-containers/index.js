'use strict';

var express = require('express');
var app = module.exports = express();

var debugContainer = require('middlewarize')(require('models/mongo/debug-container'));
var mw = require('dat-middleware');

app.get('/debug-containers',
  mw.query('instance').pick().string().require(),
  debugContainer.find('query', 'cb').async('debugContainers'),
  mw.res.json('debugContainers'));

app.post('/debug-containers',
  mw.body('instance', 'contextVersion').pick().string().require(),
  debugContainer.new('body'),
  debugContainer.instance.populate([ 'instance', 'contextVersion' ], 'cb').async('debugContainer'),
  debugContainer.instance.deploy('cb').async('debugContainer'),
  mw.res.json(201, 'debugContainer'));

app.get('/debug-containers/:id',
  mw.params('id').pick().require(),
  debugContainer.findOne('params', 'cb').async('debugContainer'),
  mw.res.json(200, 'debugContainer'));
