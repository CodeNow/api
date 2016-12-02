'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')
const uuid = require('uuid')

const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')

module.exports = class DockerComposeClusterService {
  static get log () {
    return logger.child({
      module: 'DockerComposeClusterService'
    })
  }
  /**
   * Delete Docker Compose Cluster:
   * - do not delete parentInstance
   * - create job to delete each sibling instance
   * - mark cluster as deleted
   * - emit docker-compose.cluster.deleted
   * @param {ObjectId} parentInstanceId - parent instance id
   */
  static delete (clusterId) {
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
      .then(function (cluster) {
        const id = cluster._id.toString()
        rabbitMQ.clusterDeleted({ cluster: { id } })
      })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object} parentComposeData
   * @param  {String} parentComposeData.name
   * @param  {Array<String>}  parentComposeData.env
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {String} orgGithubId
   * @param  {String} repoName
   * @return {Instance}
   */
  static createClusterParent (sessionUser, parentComposeData, orgGithubId, repoName) {
    const log = DockerComposeClusterService.log.child({
      method: 'createClusterParent',
      sessionUser, parentComposeData, orgGithubId, repoName
    })
    log.info('called')
    return DockerComposeClusterService._createParentContext(sessionUser, orgGithubId)
    .then((context) => {
      return DockerComposeClusterService._createParentContextVersion(sessionUser, context._id, orgGithubId, repoName)
    })
    .then((contextVersion) => {
      return DockerComposeClusterService._createParentBuild(sessionUser, contextVersion._id)
    })
    .then((build) => {
      return DockerComposeClusterService._createParentInstance(sessionUser, parentComposeData, build._id)
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} orgGithubId
   * @return {Context}
   */
  static _createParentContext (sessionUser, orgGithubId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentContext',
      sessionUser, orgGithubId
    })
    log.info('called')
    return ContextService.createNew(sessionUser, {
      name: uuid(),
      owner: orgGithubId
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} contextId
   * @param  {String} orgGithubId
   * @param  {String} repoName
   * @return {ContextVersion}
   */
  static _createParentContextVersion (sessionUser, contextId, orgGithubId, repoName) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentContextVersion',
      sessionUser, contextId, orgGithubId, repoName
    })
    log.info('called')
    return ContextVersion.createAppcodeVersion(sessionUser, repoName)
    .then((appCodeVersion) => {
      return ContextVersion.createWithNewInfraCode({
        context: contextId,
        createdBy: {
          github: sessionUser.accounts.github.id
        },
        owner: {
          github: sessionUser.accounts.github.id
        },
        appCodeVersions: [ appCodeVersion ]
      })
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} contextVersionId
   * @return {Build}
   */
  static _createParentBuild (sessionUser, contextVersionId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentBuild',
      sessionUser, contextVersionId
    })
    log.info('called')
    return BuildService.createBuild({
      contextVersion: contextVersionId
    }, sessionUser)
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object} parentComposeData
   * @param  {String} parentComposeData.name
   * @param  {Array<String>}  parentComposeData.env
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {ObjectId} parentBuildId
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createParentInstance (sessionUser, parentComposeData, parentBuildId) {
    const instanceOpts = {
      build: parentBuildId,
      env: parentComposeData.env,
      containerStartCommand: parentComposeData.containerStartCommand,
      name: parentComposeData.name,
      isTesting: false,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      }
    }
    const log = DockerComposeClusterService.log.child({
      method: 'createParentInstance',
      instanceOpts
    })
    log.info('called')

    return InstanceService.createInstance(instanceOpts, sessionUser)
  }
}
