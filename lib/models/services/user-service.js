'use strict'

var keypather = require('keypather')()
var logger = require('logger')

var BigPoppaClient = require('@runnable/big-poppa-client')
var bigPappaClient = new BigPoppaClient(process.env.BIG_POPPA_HOSTNAME)

var UserService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'UserService'
  }),

  /**
   * Given the accounts model of a user model, return the bigPoppa user
   *
   * @param {Object} accounts           - contains github or bitbucket account data
   * @param {Object} accounts.github    - contains github account data
   * @param {Object} accounts.github.id - githubId
   *
   * @returns {Promise} when the query finishes
   * @resolves {User}   BigPoppa model for the requested user
   */
  getUser: function (accounts) {
    var log = UserService.log.child({ method: 'UserService.getByGithubId' })
    log.trace('UserService.getByGithubId called')
    var opts = {}
    if (keypather.get(accounts, 'github.id')) {
      opts.githubId = keypather.get(accounts, 'github.id')
    }
    return bigPappaClient.getUsers(opts)
      .get('0')
      .catch(err => {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
      })
  },

  getByGithubId: function (githubId) {
    var log = UserService.log.child({ method: 'UserService.getByGithubId' })
    log.trace('UserService.getByGithubId called')
    return bigPappaClient.getUsers({ githubId: githubId })
      .get('0')
      .catch(err => {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
      })
  }

}
