'use strict';

var express = require('express');
var app = module.exports = express();

var debugContainer = require('mongooseware')(require('models/mongo/debug-container'));
var mw = require('dat-middleware');

app.get('/debug-containers',
  mw.query('instance').pick().string().require(),
  debugContainer.find('query'),
  mw.res.json('debugContainers'));

app.post('/debug-containers',
  mw.body('instance', 'contextVersion').pick().string().require(),
  debugContainer.new('body'),
  debugContainer.model.populate([ 'instance', 'contextVersion' ]),
  debugContainer.model.deploy(),
  mw.res.json(201, 'debugContainer'));

app.get('/debug-containers/:id',
  mw.params('id').pick().require(),
  debugContainer.findOne('params'),
  mw.res.json(200, 'debugContainer'));
