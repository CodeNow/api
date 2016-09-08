'use strict'

const errors = require('errors')
const exists = require('101/exists')
const keypather = require('keypather')()
const logger = require('logger')
const pluck = require('101/pluck')
const rabbitMQ = require('models/rabbitmq')

const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const Users = require('models/mongo/user')
const GitHub = require('models/apis/github')

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
  isUserPartOfOrgByGithubId: function (user, orgGithubId) {
    if (keypather.get(user, 'organizations.length')) {
      return !!user.organizations.find(function (org) {
        return org.githubId === orgGithubId
      })
    }
    return false
  },

  /**
   * Given a user model, and an org's BigPoppa Id, return whether the user belongs to the org
   *
   * @param {User}   user - bigPoppa User for whom to get the orgs
   * @param {String} orgId  - bigPoppa Org id to search for
   *
   * @returns {Boolean} true if the user belongs to the org
   */
  isUserPartOfOrg: function (user, orgId) {
    if (keypather.get(user, 'organizations.length')) {
      return !!user.organizations.find(function (userOrg) {
        return userOrg.id === orgId
      })
    }
    return false
  },

  /**
   * Fetch a bigPoppa user model for the sessionUser, and check if the user is allowed to make
   * changes to the model.  If they don't, it throws a UserNotAllowedError
   *
   * @param {User} sessionUser - sessionUser for whom to get the orgs
   * @param {String} orgId     - bigPoppa Org id to search for
   *
   * @resolves {User}              bigPoppa User model
   * @throws {UserNotFoundError}   when the user isn't in our system
   * @throws {UserNotAllowedError} when the user doesn't have access to the org
   */
  validateSessionUserPartOfOrg: function (sessionUser, orgId) {
    return UserService.getUser(sessionUser.accounts)
      .tap(function (user) {
        if (!UserService.isUserPartOfOrg(user, orgId)) {
          throw errors.UserNotAllowedError('User does not have access to org', {
            user: user,
            orgId: orgId
          })
        }
      })
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
  },

  /**
   * Given a list of Big Poppa User models, return a list of matching Mongo User Models
   *
   * @param {User} users - BigPoppa models for the requested users
   *
   * @returns {[User]} Mongo User models for the requested users
   */
  getMongoUsersByBigPoppaUsers: function (users) {
    const log = UserService.log.child({
      method: 'UserService.getMongoUsersByBigPoppaUsers',
      users: users
    })
    log.trace('UserService.getMongoUsersByBigPoppaUsers called')
    const memberIds = users.map(pluck('githubId'))
    return Users.publicFindByAsync('accounts.github.id', {$in: memberIds})
  }
}
