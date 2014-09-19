'use strict';

var express = require('express');
var app = module.exports = express();

app.use(require('./runtime'));
app.use(require('./next'));
