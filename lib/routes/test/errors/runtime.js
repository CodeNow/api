'use strict';

var express = require('express');
var app = module.exports = express();

app.get('/', function () {
  setTimeout(function () {
    throw new Error('thrown error');
  }, 0);
});