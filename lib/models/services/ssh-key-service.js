'use strict'
const rabbitMQ = require('models/rabbitmq')
const Promise = require('bluebird')

const keymakerClient = require('@runnable/keymaker-client')

const UserService = require('models/services/user-service')
const keypather = require('keypather')()

const SshKeyService = module.exports = {
  /**
   * Sets the ssh key for the user and org combo. If the key exists it overrides it.
   *
   * @returns {{username: string, fingerprint: string, avatar: string}}
   */
  saveSshKey: function (orgId, sessionUser, githubAccessToken) {
    console.log('damiens test output')
    console.log('saveSshKey', orgId)
    console.log('sessionUser', sessionUser)
    let sessionUserUsername = keypather.get(sessionUser, 'accounts.github.username')

    return UserService.getByGithubId(keypather.get(sessionUser, 'accounts.github.id'))
      .then(function(user) {
        console.log('bpuser', user)

        return rabbitMQ.publishSaveSshKey({
          orgId,
          userId: user.id,
          githubAccessToken,
          keyName: sessionUserUsername + ' User Key for ' + user
        })
      })
  },

  getSshKeysByOrg: function(orgId, accessToken) {
    return keymakerClient.fetchSSHKeys({accessToken, orgId})
  }
}
