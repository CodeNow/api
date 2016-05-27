'use strict'

var Promise = require('bluebird')
var mongoose = require('mongoose')
var SettingsSchema = require('models/mongo/schemas/settings')
var Settings

SettingsSchema.statics.findOneByGithubId = function (githubId, cb) {
  this.findOne({'owner.github': githubId}, cb)
}

Settings = module.exports = mongoose.model('Settings', SettingsSchema)

Promise.promisifyAll(Settings)
Promise.promisifyAll(Settings.prototype)
