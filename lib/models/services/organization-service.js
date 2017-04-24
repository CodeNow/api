'use strict'

const BigPoppaClient = require('@runnable/big-poppa-client')
const Boom = require('dat-middleware').Boom
const errors = require('errors')
const Github = require('models/apis/github')
const joi = require('utils/joi')
const keypather = require('keypather')()
const logger = require('logger')
const moment = require('moment')
const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')

const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

const OrganizationService = module.exports = {
  /**
   * Checks if the Organization exists
   *
   * @resolves {Undefined}
   * @throws {OrganizationNotFoundError}
   */
  checkOrg: function (id) {
    return function (org) {
      if (!org) {
        throw errors.OrganizationNotFoundError('Organization not found', { id })
      }
    }
  },

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
      .then(function addUserToOrgIfTheyArent (org) {
        // if here, then the org already exists, so add the user if they haven't been added
        return UserService.getByGithubId(userGithubId)
          .then(function (user) {
            if (!UserService.isUserPartOfOrg(user, org.id)) {
              return OrganizationService.addUser(org, user)
            }
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
            log.trace({ job }, 'Publish job')
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
    const log = OrganizationService.log.child({
      orgGithubId,
      method: 'OrganizationService.getByGithubId'
    })
    log.info('called')

    return bigPoppaClient.getOrganizations({ githubId: orgGithubId })
      .get('0')
      .catch(function () {
        throw errors.OrganizationNotFoundError('Organization not found', {
          orgGithubId
        })
      })
      .tap(OrganizationService.checkOrg(orgGithubId))
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
    const log = OrganizationService.log.child({
      orgGithubName,
      method: 'getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPoppaClient.getOrganizations({ lowerName: orgGithubName.toLowerCase() })
      .get('0')
      .catch(function () {
        throw errors.OrganizationNotFoundError('Organization not found', {
          orgName: orgGithubName
        })
      })
      .tap(OrganizationService.checkOrg(orgGithubName))
  },

  /**
   * Update an organization by an internal BigPoppa id
   *
   * @param {String} orgId   - BigPoppa id for the organization to update
   * @param {Object} updates - body with updates to apply
   *
   * @resolves {Organization} - organization model
   * @throws   {BigPoppaClientError} if a failure occurs while communicating with bigPoppa
   */
  updateById: function (orgId, updates) {
    const log = OrganizationService.log.child({
      orgId,
      method: 'updateById'
    })
    log.info('OrganizationService.updateById called')

    return bigPoppaClient.updateOrganization(orgId, updates)
      .tap(function (updatedOrg) {
        log.trace({ updatedOrg }, 'updatedOrg')
      })
  },

  /**
   * Update an organization by an internal BigPoppa id
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
   * @param {Organization} org     - BigPoppa Model of the Organization
   * @param {Number}       org.id  - BigPoppa Model Id of the Organization
   * @param {User}         user    - BigPoppa Model of the User
   * @param {Number}       user.id - BigPoppa Model Id of the User
   *
   * @resolves {Organization}        updated org with the new user attached
   * @throws   {BigPoppaClientError} when the user shouldn't be added to the given org
   */
  addUser: function (org, user) {
    var log = OrganizationService.log.child({ method: 'OrganizationService.addUser' })
    log.trace('OrganizationService.addUser called')
    return bigPoppaClient.addUserToOrganization(org.id, user.id)
  },

  /**
   * Fetches all of the registered members from BigPoppa for an org (by github name),
   * and maps to all of the models we currently store in Mongo
   *
   * @param {String} githubOrgName - Org's Github name to fetch the users
   *
   * @resolves {[User]}                    List of User models from Mongo for the given org name
   * @throws   {OrganizationNotFoundError} When the org isn't in our system
   */
  getUsersByOrgName: function (githubOrgName) {
    const log = OrganizationService.log.child({method: 'OrganizationService.addUser'})
    log.trace('OrganizationService.addUser called')
    return OrganizationService.getByGithubUsername(githubOrgName)
      .get('users')
      .then(UserService.getMongoUsersByBigPoppaUsers)
  },

  ORG_FLAG_SCHEMA: joi.object({
    prBotEnabled: joi.boolean(),
    metadata: joi.object().unknown()
  }).or('prBotEnabled', 'metadata').label('Organization opts validate'),

  /**
   * For use externally, this verifies the user has access to the org, then specifically sets only
   * the explicit flags in the opts
   *
   * @param {Number} orgId                           - bigPoppa Org id to search for
   * @param {User}   sessionUser                     - sessionUser for whom to get the orgs
   * @param {Object} opts                            - flags to update
   * @param {Object} opts.metadata                   - flag object
   * @param {Object} opts.metadata.hasConfirmedSetup - the org has completed the setup
   *
   * @resolve {Org} org with updated flags
   */
  updateFlagsOnOrg: function (orgId, sessionUser, opts) {
    const log = OrganizationService.log.child({ method: 'OrganizationService.updateFlagsOnOrg', orgId, sessionUser, opts })
    log.info('OrganizationService.updateFlagsOnOrg called')
    return joi.validateOrBoomAsync(opts, OrganizationService.ORG_FLAG_SCHEMA)
      .then(UserService.validateSessionUserPartOfOrg.bind(UserService, sessionUser, orgId))
      .then(OrganizationService.updateById.bind(OrganizationService, orgId, opts))
      .tap(OrganizationService.checkOrg.bind(OrganizationService, orgId))
  },

  UPDATE_PRIVATE_REGISTRY_SCHEMA: joi.object({
    username: joi.string().required(),
    password: joi.string().required(),
    url: joi.string().required()
  }).required(),

  /**
   * Update the private registry on a big poppa org for a session user
   * @param sessionUser
   * @param bpOrgId
   * @param privateRegistryOptions
   * @resolve undefined
   */
  updatePrivateRegistryOnOrgBySessionUser: function (sessionUser, bpOrgId, privateRegistryOptions) {
    const log = OrganizationService.log.child({ method: 'updatePrivateRegistryOnOrgBySessionUser', sessionUser, bpOrgId })
    log.info('OrganizationService.updateFlagsOnOrg called')

    return joi.validateOrBoomAsync(privateRegistryOptions, OrganizationService.UPDATE_PRIVATE_REGISTRY_SCHEMA)
      .tap(() => {
        log.trace({
          privateRegistryUrl: privateRegistryOptions.url,
          privateRegistryUsername: privateRegistryOptions.username
        }, 'validated update schema')
      })
      .tap(() => UserService.validateSessionUserPartOfOrg(sessionUser, bpOrgId))
      .tap(() => {
        log.trace({
          privateRegistryUrl: privateRegistryOptions.url,
          privateRegistryUsername: privateRegistryOptions.username
        }, 'validated owner of bp org')
        return bigPoppaClient.updateOrganization(bpOrgId, {
          privateRegistryUrl: privateRegistryOptions.url,
          privateRegistryUsername: privateRegistryOptions.username,
          privateRegistryPassword: privateRegistryOptions.privateRegistryPassword
        })
      })
  }
}
