'use strict'

var keypather = require('keypather')()
var logger = require('logger')

var BigPoppaClient = require('@runnable/big-poppa-client')
var bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
var GitHub = require('models/apis/github')

var UserService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'UserService'
  }),

  /**
   * Given the accounts model of a user model, return the bigPoppa user
   *
   * @param {Object} accounts           - contains github or bitbucket account data (most likely
   *                                        from the sessionUser)
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
    return bigPoppaClient.getUsers(opts)
      .get('0')
      .catch(function (err) {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
        throw err
      })
  },

  /**
   * Given a user model, and an org's GithubId, return whether the user belongs to the org
   *
   * @param {User}   user        - sessionUser for whom to get the orgs
   * @param {String} orgGithubId - GithubId of the org to check
   *
   * @resolves {[Boolean, User]} true if the user belongs to the org, the user model from BigPoppa
   */
  isUserPartOfOrg: function (user, orgGithubId) {
    var userGithubId = keypather.get(user, 'accounts.github.id')
    return UserService.getByGithubId(userGithubId)
      .then(function (user) {
        var matchingOrg = false
        if (keypather.get(user, 'organizations.length')) {
          matchingOrg = user.organizations.find(function (org) {
            return org.githubId === orgGithubId
          })
        }
        return [!!matchingOrg, user]
      })
  },

  /**
   * Fetches the user's authorized orgs, and puts the github org model in each org.org
   * Don't use this internally unless you actually need the github model
   *
   * @param {User} sessionUser - sessionUser for whom to get the orgs
   *
   * @resolves {[Organization]} List of organizations that are authorized in big poppa
   */
  getUsersOrganizations: function (sessionUser) {
    return this.getUser(sessionUser.accounts)
      .get('organizations')
      .then(function (orgs) {
        if (!orgs) { return [] }
        var orgsByLowerName = {}
        orgs.forEach(function (org) {
          orgsByLowerName[org.lowerName] = org
        })
        var github = new GitHub({ token: keypather.get(sessionUser, 'accounts.github.accessToken') })
        return github.getUserAuthorizedOrgsAsync()
          .each(function (githubOrg) {
            var lowercaseName = githubOrg.login.toLowerCase()
            if (orgsByLowerName[lowercaseName]) {
              orgsByLowerName[lowercaseName].org = githubOrg
            }
          })
          .return(orgs)
      })
  },

  getByGithubId: function (githubId) {
    var log = UserService.log.child({ method: 'UserService.getByGithubId' })
    log.trace('UserService.getByGithubId called')
    return bigPoppaClient.getUsers({ githubId: githubId })
      .get('0')
      .catch(function (err) {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
        throw err
      })
  }

}
