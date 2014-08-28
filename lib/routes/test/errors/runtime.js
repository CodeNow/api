'use strict';

var express = require('express');
var app = module.exports = express();

app.get('/', function (req, res, next) {
  setTimeout(function () {
    throw new Error('thrown error');
  }, 0);
});
