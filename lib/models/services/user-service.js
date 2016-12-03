'use strict'

const errors = require('errors')
const exists = require('101/exists')
const hasProps = require('101/has-properties')
const keypather = require('keypather')()
const logger = require('logger')
const pluck = require('101/pluck')
const Promise = require('bluebird')
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
   * Create or update a user in BigPoppa
   *
   * @param {Object} userGithubId    - user github id
   * @param {Object} userAccessToken - user's github access token
   *
   * @returns {void}
   */
  createOrUpdateUser: function (userGithubId, userAccessToken) {
    var log = UserService.log.child({ method: 'UserService.createOrUpdateUser' })
    log.trace('UserService.createOrUpdateUser called')
    return rabbitMQ.publishUserAuthorized({
      accessToken: userAccessToken,
      githubId: userGithubId
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
   * @param {Number} orgId  - bigPoppa Org id to search for
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
   * @param {Number} orgId     - bigPoppa Org id to search for
   *
   * @resolves {User}              bigPoppa User model
   * @throws {UserNotFoundError}   when the user isn't in our system
   * @throws {UserNotAllowedError} when the user doesn't have access to the org
   */
  validateSessionUserPartOfOrg: function (sessionUser, orgId) {
    const log = UserService.log.child({
      method: 'UserService.validateSessionUserPartOfOrg',
      orgId,
      sessionUserName: keypather.get(sessionUser, 'accounts.github.username')
    })
    log.info('UserService.createOrUpdateUser called')
    return UserService.getUser(sessionUser.accounts)
      .tap(function (user) {
        log.trace({ userId: keypather.get(user, 'id') }, 'User fetched')
        if (!UserService.isUserPartOfOrg(user, orgId)) {
          log.trace({ userId: keypather.get(user, 'id') }, 'User is not part of the organization')
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
        const orgsByGithubId = {}
        orgs.forEach(function (org) {
          orgsByGithubId[org.githubId.toString()] = org
        })
        const github = new GitHub({ token: keypather.get(sessionUser, 'accounts.github.accessToken') })
        /**
         * Fetch all authorized orgs and the authorized user since an org can be any of these.
         * If any other type of github entity is allowed to be an organization, this code would
         * need to change.
         */
        return github.getUserAuthorizedOrgsAsync()
          .then(function (orgs) {
            /**
             * We should call these simultaneously with a Promise.all but our GH
             * methods are ...not working properly... and can't handle two
             * simultaneous requests
             * (Causes a infinite loop and maxes out the call stack)
             */
            return github.getAuthorizedUserAsync()
              .then(function fetchPersonalAcccount (user) {
                // Append user to orgs
                orgs.push(user)
                return orgs
              })
          })
          .map(function addGithubOrgToBigPoppaOrg (githubOrg) {
            const githubOrgId = githubOrg.id.toString()

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
  },

  /**
   * Fetch mongo user with `bigPoppaUser` property attached
   *
   * @param {String}    id - Mongo ObjectId string for user
   * @resolves {Object}
   * @return {Promise}
   */
  getCompleteUserById: function (id) {
    const log = UserService.log.child({
      method: 'UserService.getCompleteUserById',
      id
    })
    log.info('getCompleteUserById called')
    return Users.findByIdAsync(id)
      .tap(function (user) {
        if (!user) {
          throw errors.UserNotFoundError('User not found', { id })
        }
        return UserService.getByGithubId(user.accounts.github.id)
        .then(function (bigPoppaUser) {
          user.set('bigPoppaUser', bigPoppaUser)
        })
      })
      .catch(function (err) {
        log.warn({ err }, 'Error fetching user by id')
        throw err
      })
  },

  /**
   * Fetch mongo user with `bigPoppaUser` property attached
   *
   * @param {Number}    githubId - User githubId
   * @resolves {Object}
   * @return {Promise}
   */
  getCompleteUserByGithubId: function (githubId) {
    const log = UserService.log.child({
      method: 'UserService.getCompleteUserByGithubId',
      githubId
    })
    log.info('getCompleteUserByGithubId called')
    return Users.findByGithubIdAsync(githubId)
    .tap(function (user) {
      if (!user) {
        throw errors.UserNotFoundError('User not found', { githubId })
      }
      return UserService.getByGithubId(githubId)
      .then(function (bigPoppaUser) {
        user.set('bigPoppaUser', bigPoppaUser)
        log.trace('Attaching bp user to session user')
      })
    })
    .catch(function (err) {
      log.warn({ err }, 'Error getting user')
      throw err
    })
  },

  /**
   * Fetch mongo user with `bigPoppaUser` property attached by the BP id
   *
   * @param {Number}    id - User BigPoppa ID
   * @resolves {Object}
   * @return {Promise}
   */
  getCompleteUserByBigPoppaId: function (id) {
    const log = UserService.log.child({
      method: 'UserService.getCompleteUserByBigPoppaId',
      id
    })
    log.info('called')
    return bigPoppaClient.getUser(id)
    .then(function (bigPoppaUser) {
      const githubId = bigPoppaUser.githubId
      return Users.findByGithubIdAsync(githubId)
      .then(function (user) {
        if (!user) {
          throw errors.UserNotFoundError('User not found', { githubId })
        }
        user.set('bigPoppaUser', bigPoppaUser)
        log.trace('Attaching bp user to session user')
        return user
      })
    })
    .catch(function (err) {
      log.warn({ err }, 'Error getting user')
      throw err
    })
  },

  /**
   * Simultaneously create a Mongo and a Big Poppa user
   *
   * @param {Object}   userData
   * @param {String}   userData.email
   * @param {Object}   userData.accounts
   * @param {Object}   userData.accounts.github
   * @param {Number}   userData.accounts.github.id
   * @param {String}   userData.accounts.github.accessToken
   * @param {String}   userData.accounts.github.username
   * @param {Number}   userData.permissionLevel
   * @param {Object}   userData.created
   * @returns {Object}
   * @resolves {Object} user - User object with `bigPoppaUser` property
   */
  createCompleteUser: function (userData) {
    const log = UserService.log.child({ method: 'UserService.createCompleteUser' })
    log.info({ userData }, 'UserService.createCompleteUser called')
    const githubId = userData.accounts.github.id
    const accessToken = userData.accounts.github.accessToken

    return Promise.all([
      Users.createAsync(userData),
      bigPoppaClient.createOrUpdateUser(githubId, accessToken)
    ])
    .then(function () {
      return UserService.getCompleteUserByGithubId(githubId)
    })
  },

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} fullRepoName
   * @return {BigPoppaOrgObject}
   */
  getBpOrgInfoFromRepoName: function (sessionUser, fullRepoName) {
    const orgInfo = sessionUser.bigPoppaUser.organizations.find(hasProps({
      lowerName: fullRepoName.split('/')[0].toLowerCase()
    }))

    if (!orgInfo) {
      throw errors.OrganizationNotFoundError({
        fullRepoName
      })
    }

    return orgInfo
  }
}
