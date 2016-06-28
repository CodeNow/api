'use strict'

var Boom = require('dat-middleware').Boom
var find = require('101/find')
var Github = require('models/apis/github')
var keypather = require('keypather')()
var logger = require('logger')
var orion = require('@runnable/orion')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var userWhitelist = require('models/mongo/user-whitelist')

module.exports = {
  /**
   * Creates a new whitelist entry
   * @param {String} orgName - The name of the org we want to whitelist
   * @param {Object} sessionUser - The user object of the logged in user
   * @returns {Promise}
   * @rejects {Boom.badRequest}
   * @rejects {Boom.unauthorized}
   * @rejects {Boom.notFound}
   * @resolves {Object} - UserWhitelist Mongoose Model
   */
  createWhitelist: Promise.method(function (orgName, sessionUser) {
    var log = logger.child({
      method: 'createWhitelist',
      org: orgName,
      currentUserGithub: keypather.get(sessionUser, 'accounts.github.id')
    })
    log.info('createWhitelist called')

    if (!orgName) {
      throw Boom.badRequest('orgName is required')
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
        log.trace({orgs: orgs}, 'fetched user authorized orgs')
        return find(orgs, function (org) {
          var lcOrgName = org.login.toLowerCase()
          return lcOrgName === 'codenow' ||
            lcOrgName === 'runnable' ||
            lcOrgName === orgName.toLowerCase()
        })
      })
      .tap(function (org) {
        if (!org) {
          log.trace('User does not have access to organization')
          throw Boom.unauthorized('You do not have access to this organization')
        }
      })
      .then(function (org) {
        if (org.login.toLowerCase() !== orgName.toLowerCase()) {
          // Administrative Add
          log.trace('Administrative fetch of organization')
          return github.getUserByUsernameAsync(orgName)
            .tap(function (org) {
              if (!org) {
                throw Boom.notFound('This organization does not exist')
              }
            })
        }
        return org
      })
      .then(function (org) {
        log.trace({org: org}, 'Create user whitelist entry')
        return userWhitelist.createAsync({
          name: org.login,
          allowed: true,
          githubId: org.id,
          firstDockCreated: false
        })
          .then(function (userWhitelist) {
            return {
              userWhitelist: userWhitelist,
              org: org
            }
          })
      })
      .tap(function (params) {
        var org = params.org
        log.trace({org: org, name: ghUsername}, 'Create intercom user')
        return orion.users.create({
          name: ghUsername,
          email: sessionUser.email,
          created_at: new Date(sessionUser.created) / 1000 || 0,
          update_last_request_at: true,
          companies: [{
            company_id: org.login.toLowerCase(),
            name: org.login,
            remote_created_at: Math.floor(new Date().getTime() / 1000)
          }]
        })
      })
      .tap(function (params) {
        var org = params.org
        log.trace({githubId: org.id.toString()}, 'Publish ASG Create')
        rabbitMQ.publishASGCreate({
          githubId: org.id.toString()
        })
      })
      .get('userWhitelist')
  })
}
