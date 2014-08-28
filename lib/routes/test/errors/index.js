'use strict';

var express = require('express');
var app = module.exports = express();

app.use('/runtime', require('./runtime'));
app.use('/next', require('./next'));
