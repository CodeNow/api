'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');

var instances = require('mongooseware')(require('models/mongo/instance'));

app.get('/instances/_dependencies_health',
  instances.getGraphNodeCount().exec('instanceNodeCount'),
  mw.res.json('instanceNodeCount'));
