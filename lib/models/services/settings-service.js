/**
 * Create, read, update, delete settings
 * @module lib/models/services/settings-service
 */
'use strict'

var pick = require('101/pick')
var joi = require('utils/joi')

var logger = require('logger')
var Settings = require('models/mongo/settings')

function SettingsService () {}

SettingsService.logger = logger.child({
  tx: true,
  module: 'SettingsService'
})

module.exports = SettingsService

var newSettingsSchema = joi.object({
  owner: joi.object({
    github: joi.number().required()
  }).required().unknown(),
  notifications: joi.object({
    slack: joi.object({
      apiToken: joi.string()
    }).unknown()
  }).unknown(),
  ignoredHelpCards: joi.object({}).unknown()
}).unknown().label('settings')

SettingsService.createNew = function (payload) {
  var log = this.logger.child(payload)
  log.info('call')
  return joi.validateOrBoomAsync(payload, newSettingsSchema)
    .then(function () {
      var data = pick(payload, [
        'owner',
        'notifications',
        'ignoredHelpCards'
      ])
      return Settings.createAsync(data)
    })
}
