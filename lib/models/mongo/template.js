'use strict'

/** @module models/template */

var mongoose = require('mongoose')

var TemplateSchema = require('models/mongo/schemas/template')

module.exports = mongoose.model('Template', TemplateSchema)
