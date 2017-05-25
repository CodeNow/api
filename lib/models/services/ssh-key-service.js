'use strict'
const rabbitMQ = require('models/rabbitmq')
const keymakerClient = require('@runnable/keymaker-client')
const Promise = require('bluebird')

const UserService = require('models/services/user-service')
const keypather = require('keypather')()

const logger = require('logger').child({module: 'SshKeyService'})

class SshKeyService {
  /**
   * Sets the ssh key for the user and org combo. If the key exists it overrides it.
   *
   * @returns {{username: string, fingerprint: string, avatar: string}}
   */
  static saveSshKey (orgId, sessionUser, githubAccessToken) {
    const log = logger.child({
      method: 'saveSshKey',
      orgId,
      sessionUser
    })
    log.trace('called')
    let sessionUserUsername = keypather.get(sessionUser, 'accounts.github.username')
    return UserService.getByGithubId(keypather.get(sessionUser, 'accounts.github.id'))
      .then(function (user) {
        log.trace({
          user
        }, 'fetched user by github id')
        return rabbitMQ.publishOrgUserSshKeyRequested({
          orgId,
          userId: user.id,
          githubAccessToken,
          keyName: sessionUserUsername + ' User Key for ' + user
        })
      })
  }

  static getSshKeysByOrg (orgId, accessToken) {
    const log = logger.child({
      method: 'getSshKeysByOrg',
      orgId
    })
    log.trace('called')
    return Promise.resolve(keymakerClient.fetchSSHKeys({accessToken, orgId}))
      .tap((keys) => {
        log.trace({keys}, 'Fetched keys')
      })
  }
}

module.exports = SshKeyService
