/**
 * Check permissions
 * @module lib/models/services/permission-service
 */
'use strict'

var Promise = require('bluebird')
var keypather = require('keypather')()
var hasKeypaths = require('101/has-keypaths')
var Boom = require('dat-middleware').Boom
var logger = require('logger')
var Github = require('models/apis/github')

function PermisionService () {}

PermisionService.logger = logger.child({
  tx: true,
  module: 'PermisionService'
})

module.exports = PermisionService

/**
 * Check that session user has access to the model
 * Model assumes to have `owner.github` property on which check is performed.
 * `model.owner.github` is compared first with `sessionUser` github id and then with
 * ids of user orgs
 * @param {User} user object that creates settings
 * @param {model} any Runnable mongo model (Instance, CV, Settings etc)
 * @returns {Promise}
 * @resolves with `undefined` if `sessionUser` is an owner of the `model`
 * @rejects with `Access denied (!owner)` if `sessionUser` is not an owner of the `model`
 */
PermisionService.isOwnerOf = function (sessionUser, model) {
  var log = this.logger.child({
    tx: true,
    sessionUser: sessionUser,
    model: model,
    method: 'isOwnerOf'
  })
  log.info('call')
  var modelGithubId = keypather.get(model, 'owner.github')
  var userGithubId = keypather.get(sessionUser, 'accounts.github.id')
  if (userGithubId !== modelGithubId) {
    var token = keypather.get(sessionUser, 'accounts.github.accessToken')
    var github = new Github({ token: token })
    return Promise.fromCallback(function (cb) {
      github.getUserAuthorizedOrgs(function (err, orgs) {
        if (err) { return cb(err) }
        var isMember = orgs.some(hasKeypaths({
          'id.toString()': modelGithubId.toString()
        }))
        if (!isMember) {
          log.error('Access denied (!owner)')
          cb(Boom.forbidden('Access denied (!owner)', { githubId: modelGithubId }))
        } else {
          cb()
        }
      })
    })
  } else {
    return Promise.resolve()
  }
}
