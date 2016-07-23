'use strict'

var assign = require('101/assign')
var find = require('101/find')
var keypather = require('keypather')()
var rp = require('request-promise')

var Boom = require('dat-middleware').Boom
var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var Github = require('models/apis/github')

var OrganizationService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'OrganizationService'
  }),

  /**
   * Creates a new organization
   * @param {String}               orgName     - The name of the org we want to create
   * @param {Object}               sessionUser - The user object of the logged in user
   * @returns {void}                           - Enqueues worker to create organization
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
        OrganizationService.log.info('OrganizationService.create called', { orgGithubId: githubOrg.id })
        rabbitMQ.createOrganization(githubOrg.id)
      })
  },

  delete: function (orgGithubId) {
    OrganizationService.log.info('OrganizationService.delete called', { orgGithubId: orgGithubId })
    rabbitMQ.deleteOrganization(orgGithubId)
  },

  getByGithubId: function (orgGithubId) {
    var log = OrganizationService.log.child({ orgGithubId: orgGithubId, method: 'OrganizationService.get' })
    log.info('OrganizationService.get called')
    var options = {
      uri: process.env.BIG_POPPA_URL + '/organization/?githubId=' + orgGithubId,
      headers: {
        'User-Agent': process.env.APP_NAME
      },
      json: true
    }
    log.trace('Make HTTP request', { options: options })
    return rp(options)
      .then(function (orgs) {
        log.trace('HTTP response', { orgs: orgs })
        if (orgs.length > 0) {
          log.trace('Organization found', { org: orgs[0] })
          return orgs[0]
        }
        return null
      })
      .catch(function (err) {
        // If organization is not found, return a 404
        if (keypather.get(err, 'statusCode') === 404) {
          return null
        }
        throw err
      })
  },

  getByGithubUsername: function (orgGithubName, accessToken) {
    var github = new Github({ token: accessToken })
    return github.getUserByUsernameAsync(orgGithubName)
      .then(function (org) {
        return OrganizationService.getByGithubId(org.id)
      })
  },

  updateById: function (orgId, updates) {
    var log = OrganizationService.log.child({ orgId: orgId, method: 'OrganizationService.updateById' })
    log.info('OrganizationService.updateById called')
    var options = {
      method: 'PATCH',
      uri: process.env.BIG_POPPA_URL + '/organization/' + orgId,
      headers: {
        'User-Agent': process.env.APP_NAME
      },
      body: updates,
      json: true
    }
    log.trace('Make HTTP request', { options: options })
    return rp(options)
      .then(function (res) {
        log.trace('HTTP response', { res: res })
      })
  },

  updateByGithubId: function (githubId, updates) {
    return OrganizationService.getByGithubId(githubId)
    .then(function (orgs) {
      return OrganizationService.updateById(orgs[0].id, updates)
    })
  }

}
