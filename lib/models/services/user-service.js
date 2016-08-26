'use strict'

require('loadenv')()
const errors = require('errors')
const exists = require('101/exists')
const keypather = require('keypather')()
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')

const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const GitHub = require('models/apis/github')
const siftscience = require('yield-siftscience')({ api_key: process.env.SIFT_SCIENCE_API_KEY })

const UserService = module.exports = {
  /**
   * Checks if the user exists
   *
   * @resolves {Undefined}
   * @throws {UserNotFoundError}
   */
  checkUser: function (githubId) {
    return function (user) {
      if (!user) {
        throw errors.UserNotFoundError('User not found', {
          githubId: githubId
        })
      }
    }
  },

  log: logger.child({
    module: 'UserService'
  }),

  /**
   * Create a user in BigPoppa if the don't already exist
   *
   * @param {Object} userGithubId    - user github id
   * @param {Object} userAccessToken - user's github access token
   *
   * @returns {Promise} when the query finishes
   * @resolves {User}   BigPoppa model for the requested user
   */
  createUserIfNew: function (userGithubId, userAccessToken) {
    var log = UserService.log.child({ method: 'UserService.createUserIfNew' })
    log.trace('UserService.createUserIfNew called')

    return UserService.getByGithubId(userGithubId)
      .tap(function (user) {
        return siftscience.event.login({
          $user_id: keypather.get(user, 'accounts.github.login'),
          $login_status: siftscience.CONSTANTS.STATUS.SUCCESS
        })
          .then(function () {
            const primaryEmail = (keypather.get(user, 'accounts.github.emails') || []).find(function (email) {
              return email.primary
            })
            const email = keypather.get(primaryEmail, 'value') || ''

            return siftscience.event.update_account({
              $user_id: keypather.get(user, 'accounts.github.login'),
              $user_email: email,
              $name: keypather.get(user, 'accounts.github.displayName'),
              $social_sign_on_type: '$other'
            })
          })
      })
      .catch(errors.UserNotFoundError, function () {
        return rabbitMQ.publishUserAuthorized({
          accessToken: userAccessToken,
          githubId: userGithubId
        })
      })
  },

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
      .tap(UserService.checkUser(opts.githubId))
      .catch(function (err) {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
        throw err
      })
  },

  /**
   * Given a user model, and an org's GithubId, return whether the user belongs to the org
   *
   * @param {User}   user        - bigPoppa User for whom to get the orgs
   * @param {String} orgGithubId - GithubId of the org to check
   *
   * @returns {Boolean} true if the user belongs to the org
   */
  isUserPartOfOrg: function (user, orgGithubId) {
    if (keypather.get(user, 'organizations.length')) {
      return !!user.organizations.find(function (org) {
        return org.githubId === orgGithubId
      })
    }
    return false
  },

  /**
   * Fetches the user's authorized orgs
   *
   * @param {User} sessionUser - sessionUser for whom to get the orgs
   *
   * @resolves {[Organization]} List of organizations that are authorized in big poppa
   */
  getUsersOrganizations: function (sessionUser) {
    return UserService.getUser(sessionUser.accounts)
      .get('organizations')
  },

  /**
   * Fetches the user's authorized orgs, and puts the github org model in each org.org
   * Don't use this internally unless you actually need the github model
   *
   * @param {User} sessionUser - sessionUser for whom to get the orgs
   *
   * @resolves {[Organization]} List of organizations that are authorized in big poppa
   */
  getUsersOrganizationsWithGithubModel: function (sessionUser) {
    return UserService.getUsersOrganizations(sessionUser)
      .then(function saveOrgsByName (orgs) {
        if (!orgs) {
          return []
        }
        var orgsByGithubId = {}
        orgs.forEach(function (org) {
          orgsByGithubId[org.githubId.toString()] = org
        })
        var github = new GitHub({token: keypather.get(sessionUser, 'accounts.github.accessToken')})
        return github.getUserAuthorizedOrgsAsync()
          .map(function addGithubOrgToBigPoppaOrg (githubOrg) {
            var githubOrgId = githubOrg.id.toString()

            if (orgsByGithubId[githubOrgId]) {
              orgsByGithubId[githubOrgId].org = githubOrg
              return orgsByGithubId[githubOrgId]
            }
            // Github orgs which aren't in our orgsByGithubId will return undefined here
          })
          .filter(exists) // And then are filtered out
      })
  },

  /**
   * Gets a user by its githubId
   *
   * @param {Number} githubId - githubId of the user to fetch
   *
   * @resolves {User} BigPoppa model for the requested user
   */
  getByGithubId: function (githubId) {
    var log = UserService.log.child({ method: 'UserService.getByGithubId' })
    log.trace('UserService.getByGithubId called')
    return bigPoppaClient.getUsers({ githubId: githubId })
      .get('0')
      .tap(UserService.checkUser(githubId))
      .catch(function (err) {
        log.error(err, 'UserService.getByGithubId failed to fetch the user')
        throw err
      })
  }

}
