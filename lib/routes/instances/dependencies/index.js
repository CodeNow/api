'use strict';

var express = require('express');
var app = module.exports = express();



app.all('/instances/:id/dependencies',
  function (req, res) { res.sendCode(501); });
app.all('/instances/:id/dependencies/:id',
  function (req, res) { res.sendCode(501); });
