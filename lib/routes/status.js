'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');

var xtend = require('xtend');
var redis = require('models/redis');
require('loadenv')();

app.get('/status',
  function (req, res, next) {
    req.data = {};
    redis.hgetall(process.env.REDIS_NAMESPACE + 'status-message', function (err, data) {
      if (err) { return next(err); }
      req.data = xtend(req.data, data);
      next();
    });
  },
  mw.req('data.statusCode').require()
    .then(
      mw.res.status('data.statusCode'))
    .else(
      mw.res.status(200)),
  mw.res.json('data')
);
