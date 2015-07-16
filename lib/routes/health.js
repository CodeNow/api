'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();

var util = require('util');

app.get('/health',
  function (req, res, next) {
    req.health = util.inspect(process.memoryUsage());
    next();
  },
  mw.res.json('health'));
