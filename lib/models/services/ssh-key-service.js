'use strict'
const rabbitMQ = require('models/rabbitmq')
const keymakerClient = require('@runnable/keymaker-client')
const Promise = require('bluebird')

const UserService = require('models/services/user-service')
const keypather = require('keypather')()

const logger = require('logger')

function SshKeyService () {}

SshKeyService.logger = logger.child({
  module: 'SshKeyService'
})

module.exports = class SshKeyService {
  /**
   * Sets the ssh key for the user and org combo. If the key exists it overrides it.
   *
   * @returns {{username: string, fingerprint: string, avatar: string}}
   */
  static saveSshKey (orgId, sessionUser, githubAccessToken) {
    console.log('damiens test output')
    console.log('saveSshKey', orgId)
    console.log('sessionUser', sessionUser)
    let sessionUserUsername = keypather.get(sessionUser, 'accounts.github.username')

    return UserService.getByGithubId(keypather.get(sessionUser, 'accounts.github.id'))
      .then(function (user) {
        console.log('bpuser', user)

        return rabbitMQ.publishOrgUserSshKeyRequested({
          orgId,
          userId: user.id,
          githubAccessToken,
          keyName: sessionUserUsername + ' User Key for ' + user
        })
      })
  }

  static getSshKeysByOrg (orgId, accessToken) {
    console.log('fetching from keymaker', keymakerClient.fetchSSHKeys({accessToken, orgId}))
    console.log(orgId)
    console.log(accessToken)
    return Promise.resolve(keymakerClient.fetchSSHKeys({accessToken, orgId}))
  }
}
