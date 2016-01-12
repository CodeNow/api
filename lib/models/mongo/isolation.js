/**
 * @module lib/models/mongo/isolation
 */
'use strict'

var mongoose = require('mongoose')

var IsolationSchema = require('models/mongo/schemas/isolation')

module.exports = mongoose.model('Isolation', IsolationSchema)
