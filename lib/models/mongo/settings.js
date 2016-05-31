'use strict'

var mongoose = require('mongoose')
var SettingsSchema = require('models/mongo/schemas/settings')

module.exports = mongoose.model('Settings', SettingsSchema)
