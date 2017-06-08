'use strict'
const rabbitMQ = require('models/rabbitmq')
const keymakerClient = require('@runnable/keymaker-client')
const PermissionService = require('models/services/permission-service')

const UserService = require('models/services/user-service')
const keypather = require('keypather')()

const logger = require('logger').child({module: 'SshKeyService'})

module.exports = class SshKeyService {
  /**
   * Sets the ssh key for the user and org combo. If the key exists it overrides it.
   *
   * @param {Number}      orgId             - BigPoppa OrgId
   * @param {SessionUser} sessionUser       - SessionUser model
   * @param {String}      githubAccessToken - Access Token for the given user
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

  /**
   * Returns all of the orgs ssh keys
   *
   * @param {Number}      orgId             - BigPoppa OrgId
   * @param {SessionUser} sessionUser       - SessionUser model
   * @param {String}      accessToken       - Github accesstoken
   * @returns Promise resolving to array of key objects
   */
  static getSshKeysByOrg (orgId, sessionUser, accessToken) {
    const log = logger.child({
      method: 'getSshKeysByOrg',
      orgId
    })
    log.trace('called')
    return PermissionService.isInOrgOrModerator(orgId)
      .then(() => keymakerClient.fetchSSHKeys({accessToken, orgId}))
  }
}
