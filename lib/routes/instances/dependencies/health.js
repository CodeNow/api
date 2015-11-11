'use strict'

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')

var instances = require('mongooseware')(require('models/mongo/instance'))

app.get('/dependencies/actions/health',
  instances.getGraphNodeCount().exec('instanceNodeCount'),
  mw.res.json('instanceNodeCount'))
