'use strict'

var Boom = require('dat-middleware').Boom
var find = require('101/find')
var Github = require('models/apis/github')
var includes = require('101/includes')
var keypather = require('keypather')()
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
   * @resolves {Undefined}
   */
  createWhitelist: Promise.method(function (orgName, sessionUser) {
    if (!orgName) {
      throw Boom.badRequest('orgName is required')
    }
    var authToken = keypather.get(sessionUser, 'accounts.github.accessToken')

    if (!sessionUser || !authToken) {
      throw Boom.unauthorized('You must be logged in in order to create a whitelist entry.')
    }

    var github = new Github({ token: authToken })
    return github.getUserAuthorizedOrgsAsync(orgName)
      .tap(function (orgs) {
        var orgList = orgs.map(function (org) {
          return org.login.toLowerCase()
        })
        if (!includes(orgList, orgName.toLowerCase()) && !includes(orgList, 'codenow') && !includes(orgList, 'runnable')) {
          throw Boom.unauthorized('You do not have access to this organization')
        }
      })
      .then(function (orgs) {
        return find(orgs, function (org) {
          return org.login.toLowerCase() === orgName.toLowerCase()
        })
      })
      .then(function (org) {
        if (!org) { // Administrative Add
          return github.getUserByUsernameAsync(orgName)
            .tap(function (org) {
              if (!org) {
                throw Boom.notFound('This organization does not exist')
              }
            })
        }
        return org
      })
      .tap(function (org) {
        return userWhitelist.createAsync({
          name: org.login,
          allowed: true,
          githubId: org.id,
          firstDockCreated: false
        })
      })
      .tap(function (org) {
        return orion.users.create({
          name: sessionUser.accounts.github.username,
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
      .tap(function (org) {
        rabbitMQ.publishASGCreate({
          githubId: org.id.toString()
        })
      })
      .return(undefined)
  })
};
