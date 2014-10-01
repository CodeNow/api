'use strict';

var express = require('express');
var app = module.exports = express();

app.get('/test/errors/runtime/', function () {
  setTimeout(function () {
    throw new Error('thrown error');
  }, 0);
});
