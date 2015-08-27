'use strict';

var express = require('express');
var app = module.exports = express();
var heapdump = require('heapdump');
var me = require('middlewares/me');

app.post('/actions/heapdump/',
  me.isModerator,
  function (req, res, next) {
    heapdump.writeSnapshot(function(err, filename) {
      if (err) { return next(err); }
      res.send('dump written to ' + filename);
    });
  });