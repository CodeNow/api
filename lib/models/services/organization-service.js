'use strict'

const Boom = require('dat-middleware').Boom
const errors = require('errors')
const keypather = require('keypather')()
const logger = require('logger')
const moment = require('moment')
const rabbitMQ = require('models/rabbitmq')

const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const Github = require('models/apis/github')
const userService = require('models/services/user-service')
const Promise = require('bluebird')

const OrganizationService = module.exports = {

  log: logger.child({
    module: 'OrganizationService'
  }),

  /**
   * Creates a new organization
   *
   * @param {String} orgGithubName - The name of the org we want to create
   * @param {Object} sessionUser   - The user object of the logged in user
   *
   * @resolves {Undefined}          - Enqueues worker to create organization
   * @rejects {Boom.badRequest}
   * @rejects {Boom.unauthorized}
   * @rejects {Boom.notFound}
   */
  create: function (orgGithubName, sessionUser) {
    var userGithubId = keypather.get(sessionUser, 'accounts.github.id')
    var userAuthToken = keypather.get(sessionUser, 'accounts.github.accessToken')
    var userGithubUsername = keypather.get(sessionUser, 'accounts.github.username')

    var log = logger.child({
      method: 'create',
      org: orgGithubName,
      currentUserGithub: userGithubId
    })
    log.info('OrganizationService.create called')

    return Promise
      .try(function () {
        if (!orgGithubName) {
          throw Boom.badRequest('orgGithubName is required')
        }
        if (!sessionUser || !userAuthToken || !userGithubUsername) {
          throw Boom.unauthorized('You must be logged in in order to create a whitelist entry.')
        }
        log.trace('passed validation')
        return OrganizationService.getByGithubUsername(orgGithubName)
      })
      .then(function addUserToOrgIfTheyArent(org) {
        // if here, then the org already exists, so just check their permissions
        return userService.getByGithubId(userGithubId)
          .then(function (user) {
            return OrganizationService.addUser(org, user)
          })
      })
      .catch(errors.OrganizationNotFoundError, function () {
        var github = new Github({token: userAuthToken})
        return github.getUserByUsernameAsync(orgGithubName)
          .then(function (githubOrg) {
            var job = {
              githubId: githubOrg.id,
              creator: {
                githubId: userGithubId,
                githubUsername: userGithubUsername,
                email: sessionUser.email,
                created: moment(sessionUser.created).toISOString()
              }
            }
            log.trace({job: job}, 'Publish job')
            return rabbitMQ.publishOrganizationAuthorized(job)
          })
      })
  },

  /**
   * Fetches an organization by it's github id
   *
   * @param {String} orgGithubId - Github id for the organization to fetch
   *
   * @resolves {Organization}              organization model
   * @throws   {BigPoppaClientError}       if a failure occurs while communicating with bigPoppa
   * @throws   {OrganizationNotFoundError} when no organization could be found
   */
  getByGithubId: function (orgGithubId) {
    var log = OrganizationService.log.child({
      orgGithubId: orgGithubId,
      method: 'OrganizationService.getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPoppaClient.getOrganizations({ githubId: orgGithubId })
      .get('0')
      .catch(function () {
        throw errors.OrganizationNotFoundError('Organization not found', {
          orgGithubId: orgGithubId
        })
      })
  },

  /**
   * Fetches an organization by it's github login name
   *
   * @param {String} orgGithubName - Github login name for the organization
   *
   * @resolves {Organization}              organization model
   * @throws   {BigPoppaClientError}       if a failure occurs while communicating with bigPoppa
   * @throws   {OrganizationNotFoundError} when no organization could be found
   */
  getByGithubUsername: function (orgGithubName) {
    var log = OrganizationService.log.child({
      orgGithubName: orgGithubName,
      method: 'getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPoppaClient.getOrganizations({ name: orgGithubName })
      .get('0')
      .catch(function () {
        throw errors.OrganizationNotFoundError('Organization not found', {
          orgName: orgGithubName
        })
      })
  },

  /**
   * Updates an organization by an internal postgres id
   *
   * @param {String} orgId   - PostGresSQL id for the organization to update
   * @param {Object} updates - body with updates to apply
   *
   * @resolves {Organization} - organization model
   * @throws   {BigPoppaClientError} if a failure occurs while communicating with bigPoppa
   */
  updateById: function (orgId, updates) {
    var log = OrganizationService.log.child({
      orgId: orgId,
      method: 'updateById'
    })
    log.info('OrganizationService.updateById called')

    return bigPoppaClient.updateOrganization(orgId, updates)
      .tap(function (updatedOrg) {
        log.trace({ updatedOrg: updatedOrg }, 'updatedOrg')
      })
  },

  /**
   * Updates an organization by an internal postgres id
   *
   * @param {String} githubId - Github id for the organization to update
   * @param {Object} updates  - body with updates to apply
   *
   * @resolves {Organization} updated organization model
   */
  updateByGithubId: function (githubId, updates) {
    return OrganizationService.getByGithubId(githubId)
      .then(function (org) {
        return OrganizationService.updateById(org.id, updates)
      })
  },

  /**
   * Adds a user to an org (if allowed)
   *
   * @param {Organization} org     - PostGres Model of the Organization
   * @param {Number}       org.id  - PostGres Model Id of the Organization
   * @param {User}         user    - PostGres Model of the User
   * @param {Number}       user.id - PostGres Model Id of the User
   *
   * @resolves {Organization}        updated org with the new user attached
   * @throws   {BigPoppaClientError} when the user shouldn't be added to the given org
   */
  addUser: function (org, user) {
    var log = OrganizationService.log.child({ method: 'OrganizationService.addUser' })
    log.trace('OrganizationService.addUser called')
    return bigPoppaClient.addUserToOrganization(org.id, user.id)
  }
}
