'use strict';

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var Boom = mw.Boom;

app.get('/boom', mw.next(Boom.badRequest('next error')));
app.get('/unknown', mw.next(new Error('unknown')));
