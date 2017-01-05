/**
 * Create, read, update, delete settings
 * @module lib/models/services/settings-service
 */
'use strict'
const joi = require('utils/joi')
const pick = require('101/pick')

const logger = require('logger')
const PermissionService = require('models/services/permission-service')
const Settings = require('models/mongo/settings')

function SettingsService () {}

SettingsService.logger = logger.child({
  module: 'SettingsService'
})

module.exports = SettingsService

const newSettingsSchema = joi.object({
  owner: joi.object({
    github: joi.number().required()
  }).required().unknown(),
  notifications: joi.object({
    slack: joi.object({
      apiToken: joi.string()
    }).unknown()
  }).unknown(),
  ignoredHelpCards: joi.array()
}).unknown().label('settings')

/**
 * Create new settings for an org
 * @param {User} user object that creates settings
 * @param {Object} initial settinsg payload
 * @returns {Promise} Resolved when settings model was saved or validation failed
 */
SettingsService.createNew = function (sessionUser, payload) {
  const log = this.logger.child({
    payload: payload,
    method: 'createNew'
  })
  log.info('called')
  return joi.validateOrBoomAsync(payload, newSettingsSchema)
    .then(PermissionService.isOwnerOf.bind(PermissionService, sessionUser, payload))
    .then(function () {
      const data = pick(payload, [
        'owner',
        'notifications',
        'ignoredHelpCards'
      ])
      return Settings.createAsync(data)
    })
}
