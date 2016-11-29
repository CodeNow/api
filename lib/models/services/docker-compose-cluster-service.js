'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')

const logger = require('logger')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const GitHub = require('models/apis/github')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const rabbitMQ = require('models/rabbitmq')

const DockerComposeClusterService = module.exports = {

  log: logger.child({
    module: 'DockerComposeClusterService'
  }),

  /**
   * Create Docker Compose Cluster
   * - fetch compose file content from github
   * - parse compose content
   * - create DockerComposeCluster mongo model
   * - emit docker-compose.cluster.created
   * @param {Object} sessionUser - session user full object
   * @param {String} triggeredAction - action that triggered creation
   * @param {String} repoName - full repo name
   * @param {String} branchName - branch name
   * @param {String} dockerComposeFilePath - path to the compose file
   * @param {String} newInstanceName - optional new instance name
   * @return {Promise} with object that has `cluster` and `parsedCompose` objects
   */
  create: function (sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName) {
    const log = DockerComposeClusterService.log.child({
      method: 'create',
      repoName, branchName, dockerComposeFilePath, newInstanceName
    })
    log.info('called')
    const token = keypather.get(sessionUser, 'accounts.github.accessToken')
    const ownerUsername = keypather.get(sessionUser, 'accounts.github.username')
    const github = new GitHub({ token })
    return github.getRepoContentAsync(repoName, dockerComposeFilePath)
      .then(function (dockerComposeFileString) {
        return octobear.parse({
          dockerComposeFileString,
          repositoryName: newInstanceName,
          ownerUsername,
          userContentDomain: process.env.USER_CONTENT_DOMAIN
        })
      })
      .then(function (parsedCompose) {
        const sessionUserGithubId = keypather.get(sessionUser, 'accounts.github.id')
        const clusterOpts = {
          dockerComposeFilePath,
          createdBy: sessionUserGithubId,
          triggeredAction
        }
        return DockerComposeCluster.createAsync(clusterOpts)
          .then(function (cluster) {
            return {
              cluster,
              parsedCompose
            }
          })
      })
      .tap(function (resp) {
        const id = resp.cluster._id.toString()
        rabbitMQ.clusterCreated({
          cluster: { id },
          parsedCompose: resp.parsedCompose
        })
      })
  },

  /**
   * Delete Docker Compose Cluster:
   * - do not delete parentInstance
   * - create job to delete each sibling instance
   * - mark cluster as deleted
   * - emit docker-compose.cluster.deleted
   * @param {ObjectId} parentInstanceId - parent instance id
   */
  delete: function (clusterId) {
    const log = DockerComposeClusterService.log.child({
      method: 'delete',
      clusterId
    })
    log.info('called')
    return DockerComposeCluster.findByIdAsync(clusterId)
      .tap(function (cluster) {
        const siblingsIds = cluster.siblingsInstanceIds || []
        siblingsIds.forEach(function (instanceId) {
          rabbitMQ.deleteInstance({ instanceId })
        })
      })
      .tap(function (cluster) {
        return DockerComposeCluster.markAsDeleted(cluster._id)
      })
      .tap(function (cluster) {
        rabbitMQ.clusterDeleted({ cluster: { id: clusterId } })
      })
  }
}
