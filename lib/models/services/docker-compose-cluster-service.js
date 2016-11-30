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

const logGen = logger.child({
  module: 'DockerComposeClusterService'
})

module.exports = class DockerComposeClusterService {
  /**
   * Delete Docker Compose Cluster:
   * - do not delete parentInstance
   * - create job to delete each sibling instance
   * - mark cluster as deleted
   * - emit docker-compose.cluster.deleted
   * @param {ObjectId} parentInstanceId - parent instance id
   */
  static delete (parentInstanceId) {
    const log = logGen.child({
      method: 'delete',
      parentInstanceId
    })
    log.info('delete called')
    return DockerComposeCluster.findActiveByParentId(parentInstanceId)
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
        rabbitMQ.clusterDeleted({ id })
      })
  }

  static createClusterParent (parentComposeData, sessionUser, orgGithubId, repoName) {
    return DockerComposeClusterService._createParentContext(sessionUser, orgGithubId)
    .then((context) => {
      return DockerComposeClusterService._createParentContextVersion(context._id, sessionUser, orgGithubId, repoName)
    })
    .then((contextVersion) => {
      return DockerComposeClusterService._createParentBuild(contextVersion._id, sessionUser)
    })
    .then((build) => {
      return DockerComposeClusterService._createParentInstance(parentComposeData, build._id, sessionUser)
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} orgGithubId
   * @return {Context}
   */
  static _createParentContext (sessionUser, orgGithubId) {
    return ContextService.createNew(sessionUser, {
      name: uuid(),
      owner: orgGithubId
    })
  }

  /**
   * @param  {String} contextId
   * @param  {SessionUser} sessionUser
   * @param  {String} orgGithubId
   * @return {ContextVersion}
   */
  static _createParentContextVersion (contextId, sessionUser, orgGithubId, repoName) {
    return ContextVersion.createAppcodeVersion(sessionUser, repoName)
    .then((appCodeVersion) => {
      return ContextVersion.createWithNewInfraCode({
        context: contextId,
        createdBy: {
          github: sessionUser
        },
        owner: {
          github: sessionUser.accounts.github.id
        },
        appCodeVersions: [ appCodeVersion ]
      })
    })
  }

  /**
   * @param  {String} contextVersionId
   * @param  {SessionUser} sessionUser
   * @return {Build}
   */
  static _createParentBuild (contextVersionId, sessionUser) {
    return BuildService.createBuild({
      contextVersion: contextVersionId
    }, sessionUser)
  }

  /**
   * @param  {Object} parentComposeData
   * @param  {String} parentComposeData.name
   * @param  {Array<String>}  parentComposeData.env
   * @param  {Array<Number>}  parentComposeData.ports
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {ObjectId} parentBuildId
   * @param  {SessionUser} sessionUser
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createParentInstance (parentComposeData, parentBuildId, sessionUser) {
    const instanceOpts = {
      build: parentBuildId,
      env: parentComposeData.env,
      ports: parentComposeData.ports,
      containerStartCommand: parentComposeData.containerStartCommand,
      name: parentComposeData.name,
      isTesting: false,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      }
    }
    const log = logGen.child({
      method: 'createParentInstance',
      instanceOpts
    })
    log.info('createParentInstance called')

    return InstanceService.createInstance(instanceOpts, sessionUser)
  }
}
