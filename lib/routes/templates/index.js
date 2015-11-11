'use strict'

/** @module lib/routes/templates */

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var checkFound = require('middlewares/check-found')

var template = require('mongooseware')(require('models/mongo/template'))

/** query for all templates
 *  @event GET rest/templates
 *  @memberof module:lib/routes/templates */
app.get('/templates',
  template.find({ $or: [
      { 'deleted': { $exists: false } },
      { 'deleted': false }
  ] }),
  checkFound('templates'),
  mw.res.json('templates'))
