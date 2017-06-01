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
   * @param orgId: Bigpoppa orgId, Int
   * @param sessionUser: Object
   * @param githubAccessToken: String
   *
   * @returns Promise from rabbitMQ's publish of the create event.
   */
  static saveSshKey (orgId, sessionUser, githubAccessToken) {
    const log = logger.child({
      method: 'saveSshKey',
      orgId,
      sessionUser
    })
    log.trace('called')
    return UserService.getByGithubId(keypather.get(sessionUser, 'accounts.github.id'))
      .then((user) => {
        // Find ORG name from user orgs list
        const sshKeyOrg = user.organizations.find(org => org.id === orgId)
        const keyName = process.env.SSH_KEY_PREAMBLE + ' key for ' + sshKeyOrg.name
        log.trace({
          keyName
        }, 'Calculated key name')
        return rabbitMQ.publishOrgUserSshKeyRequested({
          orgId,
          userId: user.id,
          githubAccessToken,
          keyName: keyName
        })
      })
  }

  static getSshKeysByOrg (orgId, accessToken) {
    const log = logger.child({
      method: 'getSshKeysByOrg',
      orgId
    })
    log.trace('called')
    // Wrap the native promise in a bluebird promise so we can tap it.
    return Promise.resolve(keymakerClient.fetchSSHKeys({accessToken, orgId}))
      .tap((keys) => {
        log.trace({keys}, 'Fetched keys')
      })
  }
}

module.exports = SshKeyService
