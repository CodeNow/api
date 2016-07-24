'use strict'

var assign = require('101/assign')
var keypather = require('keypather')()
var Promise = require('bluebird')
var logger = require('logger')

var GitHub = require('models/apis/github')
var OrganizationService = require('models/services/organization-service')

var UserService = module.exports = {

  log: logger.child({
    tx: true,
    module: 'UserService'
  }),

  /**
   * Fetch user model and fetch organizations user belongs to
   *
   * TEMPORARY: This will change to using big-poppa soon
   *
   * @param {Number} userGithubId - Github ID for user
   * @resolves {Object} - User object
   * @returns {Promise}
   */
  getAllUserOrganizationsByAccessToken: Promise.method(function (accessToken) {
    var log = UserService.log.child({ method: 'UserService.getByGithubId' })
    log.info('UserService.getByGithubId called')
    if (!accessToken) {
      throw new Error('An access token must be provided')
    }
    var github = new GitHub({ token: accessToken })
    return github.getUserAuthorizedOrgsAsync()
      .then(function (githubOrgsArray) {
        var githubOrgs = {}
        githubOrgsArray.forEach(function (githubOrg) {
          githubOrgs[githubOrg.id] = githubOrg
        })
        log.trace({ githubOrgs: githubOrgs }, 'Found all user github orgs')
        return Promise
          .map(githubOrgsArray, function (githubOrg) {
            // Returns `null` if not found which filters out the org
            return OrganizationService.getByGithubId(githubOrg.id)
              .then(function (org) {
                if (!org) {
                  log.trace({ githubOrg: githubOrg }, 'Github org is not registered in runnable')
                  return false
                }
                var githubOrgName = keypather.get(githubOrg, 'login')
                log.trace({ org: org, githubOrg: githubOrg }, 'Parsing org to return to user')
                // Maintain compatibility with UserWhitelist model in order to
                // assure front-end works as expected
                return assign(org, {
                  name: githubOrgName,
                  lowerName: keypather.get(githubOrgName, 'toLowerCase()'),
                  githubId: githubOrg.id,
                  org: githubOrg
                })
              })
          })
          .filter(function (org) { return !!org })
      })
  })

}
