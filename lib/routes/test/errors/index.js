/**
 * @module lib/routes/test/errors/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

app.use(require('routes/test/errors/runtime'))
app.use(require('routes/test/errors/next'))
