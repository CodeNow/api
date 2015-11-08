'use strict'

var express = require('express')
var app = module.exports = express()
var mw = require('dat-middleware')
var Boom = mw.Boom

app.get('/test/errors/next/boom',
  mw.next(Boom.badRequest('next error')))

app.get('/test/errors/next/unknown',
  mw.next(new Error('unknown')))
