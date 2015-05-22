'use strict';

var express = require('express');
var app = module.exports = express();

app.get('/test/errors/runtime/', function () {
  setTimeout(function () {
    throw new Error('thrown error');
  }, 0);
});

app.get('/test/errors/runtime/background', function (req, res) {
  setTimeout(function () {
    throw new Error('thrown error');
  }, 0);// the test clears the timer on this
  res.send(200);
});