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
   * @param {String} repoFullName - full repo name E.x. Runnable/api
   * @param {String} branchName - branch name
   * @param {String} dockerComposeFilePath - path to the compose file
   * @param {String} newInstanceName - optional new instance name
   * @return {Promise} with object that has `cluster` and `parsedCompose` objects
   */
  create: function (sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName) {
    const log = DockerComposeClusterService.log.child({
      method: 'create',
      repoFullName, branchName, dockerComposeFilePath, newInstanceName
    })
    log.info('called')
    const token = keypather.get(sessionUser, 'accounts.github.accessToken')
    const repoTokens = repoFullName.split('/')
    const ownerUsername = repoTokens[0].toLowerCase()
    const repoName = repoTokens[1]
    const github = new GitHub({ token })
    return github.getRepoContentAsync(repoFullName, dockerComposeFilePath)
      .then(function (fileContent) {
        log.info({ fileContent }, 'content response')
        const base64Content = fileContent.content
        const buf = new Buffer(base64Content, 'base64')
        return buf.toString()
      })
      .then(function (dockerComposeFileString) {
        log.info({ dockerComposeFileString }, 'content response')
        const parseInput = {
          dockerComposeFileString,
          repositoryName: newInstanceName || repoName,
          ownerUsername,
          userContentDomain: process.env.USER_CONTENT_DOMAIN
        }
        log.info({ parseInput }, 'octobear input')
        return octobear.parse(parseInput)
      })
      .then(function (parsedCompose) {
        log.info({ parsedCompose }, 'parsed compose')
        const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
        const clusterOpts = {
          dockerComposeFilePath,
          createdBy: sessionUserBigPoppaId,
          triggeredAction
        }
        log.info(clusterOpts, 'new cluster data')
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
    return DockerComposeCluster.findByIdAndAssert(clusterId)
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
