'use strict';

var express = require('express');
var mw = require('dat-middleware');
var app = module.exports = express();

app.get('/health', function(req, res, next) {
  req.health = process.memoryUsage();
  next();
},
  mw.res.json('health'));
