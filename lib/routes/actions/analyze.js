'use strict';

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');

app.get('/actions/analyze/',
        mw.res.status(200),
        mw.res.send('ok'));
