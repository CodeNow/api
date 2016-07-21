'use strict'

var assign = require('assign')
var keypather = require('keypather')()
var rp = require('request-promise')

var rabbitMQ = require('models/rabbitmq')
var logger = require('logger')
var GitHub = require('models/apis/github')

var OrganizationService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'OrganizationService'
  }),

  create: function (orgGithubId) {
    OrganizationService.log.info('OrganizationService.create called', { orgGithubId: orgGithubId })
    rabbitMQ.createOrganization(orgGithubId)
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
  },

  getByGithubIdWithGithubOrg: function (orgGithubId, accessToken) {
    var github = new GitHub({ token: accessToken })
    return OrganizationService.getByGithubId(orgGithubId)
      .then(function (org) {
        return [org, github.getUserByIdAsync(orgGithubId)]
      })
      .spread(function (org, githubOrg) {
        if (!githubOrg) {
          return org
        }
        var githubOrgName = keypather.get(githubOrg, 'login')
        // Maintain compatibility with UserWhitelist model in order to
        // assure front-end works as expected
        return assign(org, {
          name: githubOrgName,
          lowerName: keypather.get(githubOrgName, 'toLowerCase()'),
          githubId: orgGithubId,
          org: githubOrg
        })
      })
  },

  getByGithubUsername: function (orgGithubName, accessToken) {
    var github = new GitHub({ token: accessToken })
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
