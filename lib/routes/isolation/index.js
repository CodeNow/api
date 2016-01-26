/**
 * @module lib/routes/isolation/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

app.post('/isolations', function (req, res, next) {
  next()
})
