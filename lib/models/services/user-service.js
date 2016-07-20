'use strict'

var rp = require('request-promise')
var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')

var UserService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'UserService'
  }),

  create: function (opts) {
    UserService.log.info('UserService.create called', { opts: opts })
    rabbitMQ.createOrganization(opts.userGithubId)
  },

  getByGithubId: function (userGithubId) {
    var log = UserService.log.child({ userGithubId: userGithubId, method: 'UserService.get' })
    log.info('UserService.get called')
    var options = {
      uri: process.env.BIG_POPPA_URL + '/user/?github_id=' + userGithubId,
      headers: {
        'User-Agent': process.env.APP_NAME
      },
      json: true
    }
    log.trace('Make HTTP request', { options: options })
    return rp(options)
      .then(function (users) {
        log.trace('HTTP response', { users: users })
        if (users.length > 0) {
          log.trace('User found', { user: users[0] })
          return users[0]
        }
        return null
      })
  }

}
