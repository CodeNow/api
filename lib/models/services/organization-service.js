'use strict'

var find = require('101/find')
var keypather = require('keypather')()
var BigPoppaClient = require('@runnable/big-poppa-client')
var bigPappaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

var Boom = require('dat-middleware').Boom
var errors = require('errors')
var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var moment = require('moment')
var Github = require('models/apis/github')

var OrganizationService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'OrganizationService'
  }),

  /**
   * Creates a new organization
   *
   * @param {String} orgGithubName - The name of the org we want to create
   * @param {Object} sessionUser   - The user object of the logged in user
   *
   * @returns {Null}               - Enqueues worker to create organization
   * @rejects {Boom.badRequest}
   * @rejects {Boom.unauthorized}
   * @rejects {Boom.notFound}
   */
  create: function (orgGithubName, sessionUser) {
    var log = logger.child({
      method: 'createWhitelist',
      org: orgGithubName,
      currentUserGithub: keypather.get(sessionUser, 'accounts.github.id')
    })
    log.info('createWhitelist called')

    if (!orgGithubName) {
      throw Boom.badRequest('orgGithubName is required')
    }
    var authToken = keypather.get(sessionUser, 'accounts.github.accessToken')
    var ghUsername = keypather.get(sessionUser, 'accounts.github.username')

    if (!sessionUser || !authToken || !ghUsername) {
      throw Boom.unauthorized('You must be logged in in order to create a whitelist entry.')
    }

    log.trace('passed validation')
    var github = new Github({ token: authToken })
    return github.getUserAuthorizedOrgsAsync()
      .then(function (orgs) {
        log.trace({ orgs: orgs }, 'fetched user authorized orgs')
        return find(orgs, function (org) {
          var lcOrgName = org.login.toLowerCase()
          return lcOrgName === 'codenow' ||
            lcOrgName === 'runnable' ||
            lcOrgName === orgGithubName.toLowerCase()
        })
      })
      .tap(function (org) {
        if (!org) {
          log.trace('User does not have access to organization')
          throw Boom.unauthorized('You do not have access to this organization')
        }
      })
      .then(function (org) {
        if (org.login.toLowerCase() !== orgGithubName.toLowerCase()) {
          // Administrative Add
          log.trace('Administrative fetch of organization')
          return github.getUserByUsernameAsync(orgGithubName)
            .tap(function (org) {
              if (!org) {
                throw Boom.notFound('This organization does not exist')
              }
            })
        }
        return org
      })
      .then(function (githubOrg) {
        OrganizationService.log.info({ orgGithubId: githubOrg.id }, 'OrganizationService.create called')
        var job = {
          githubId: githubOrg.id,
          creator: {
            githubId: sessionUser.id,
            githubUsername: ghUsername,
            email: sessionUser.email,
            created: moment(sessionUser.created).format('X') // Unix timestamp
          }
        }
        log.trace({ job: job }, 'Publish job')
        rabbitMQ.publishOrganizationAuthorized(job)
      })
  },

  delete: function (orgGithubId) {
    OrganizationService.log.info({ orgGithubId: orgGithubId }, 'OrganizationService.delete called')
    rabbitMQ.deleteOrganization({ githubId: orgGithubId })
  },

  getByGithubId: function (orgGithubId) {
    var log = OrganizationService.log.child({ orgGithubId: orgGithubId, method: 'OrganizationService.getByGithubId' })
    log.info('OrganizationService.getByGithubId called')

    return bigPappaClient.getOrganizations({
      githubId: orgGithubId
    })
      .tap((orgs) => {
        if (!orgs.length) {
          throw errors.OrganizationNotFoundError('Organization not found')
        }
      })
      .get('0')
  },

  getByGithubUsername: function (orgGithubName) {
    var log = OrganizationService.log.child({
      orgGithubName: orgGithubName,
      method: 'OrganizationService.getByGithubId'
    })
    log.info('OrganizationService.getByGithubId called')

    return bigPappaClient.getOrganizations({ name: orgGithubName })
      .get('0')
      .catch(() => {
        throw errors.OrganizationNotFoundError('Organization not found')
      })
  },

  /**
   * Updates an organization by an internal postgres id
   *
   * @param {String} orgId   - PostGresSQL id for the organization to update
   * @param {Object} updates - body with updates to apply
   * @returns {*}
   */
  updateById: function (orgId, updates) {
    var log = OrganizationService.log.child({ orgId: orgId, method: 'OrganizationService.updateById' })
    log.info('OrganizationService.updateById called')

    return bigPappaClient.updateOrganization(orgId, updates)
      .tap(function (updatedOrg) {
        log.trace({ updatedOrg: updatedOrg }, 'updatedOrg')
      })
  },

  updateByGithubId: function (githubId, updates) {
    return OrganizationService.getByGithubId(githubId)
    .then(function (orgs) {
      return OrganizationService.updateById(orgs[0].id, updates)
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
   * @resolves {Organization}        updated org with the new
   * @throws   {BigPoppaClientError} when the user shouldn't be added to the given org
   */
  addUser: function (org, user) {
    var log = OrganizationService.log.child({ method: 'OrganizationService.addUser' })
    log.trace('OrganizationService.addUser called')
    return bigPappaClient.addUserToOrganization(org.id, user.id)
  }
}
