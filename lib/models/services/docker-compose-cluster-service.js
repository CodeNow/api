'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const uuid = require('uuid')

const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const GitHub = require('models/apis/github')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')

module.exports = class DockerComposeClusterService {
  static get log () {
    return logger.child({
      module: 'DockerComposeClusterService'
    })
  }
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
  static create (sessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName) {
    const log = DockerComposeClusterService.log.child({
      method: 'create',
      sessionUser,
      triggeredAction,
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
        log.info({ clusterOpts }, 'new cluster data')
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
  }

  /**
   * Delete Docker Compose Cluster:
   * - do not delete parentInstance
   * - create job to delete each sibling instance
   * - mark cluster as deleted
   * - emit docker-compose.cluster.deleted
   * @param {ObjectId} clusterId - id of the cluster
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
      .tap(function (cluster) {
        rabbitMQ.clusterDeleted({ cluster: { id: clusterId } })
      })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object} parentComposeData
   * @param  {String} parentComposeData.contextVersion.buildDockerfilePath
   * @param  {String} parentComposeData.instance.name
   * @param  {Array<String>}  parentComposeData.instance.env
   * @param  {String}  parentComposeData.instance.containerStartCommand
   * @param  {String} fullRepoName (org/repo)
   * @return {Instance}
   */
  static createClusterParent (sessionUser, parentComposeData, fullRepoName) {
    const log = DockerComposeClusterService.log.child({
      method: 'createClusterParent',
      sessionUser, parentComposeData, fullRepoName
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, fullRepoName)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }

    return DockerComposeClusterService._createContext(sessionUser, orgInfo)
    .then((context) => {
      return DockerComposeClusterService._createParentContextVersion(sessionUser, context._id, orgInfo, fullRepoName, parentComposeData.contextVersion.buildDockerfilePath)
    })
    .then((contextVersion) => {
      return DockerComposeClusterService._createBuild(sessionUser, contextVersion._id)
    })
    .then((build) => {
      return DockerComposeClusterService._createInstance(sessionUser, parentComposeData.instance, build._id)
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object}  orgInfo
   * @param  {Object}  orgInfo.githubOrgId
   * @param  {Object}  orgInfo.bigPoppaOrgId
   * @return {Context}
   */
  static _createContext (sessionUser, orgInfo) {
    const log = DockerComposeClusterService.log.child({
      method: '_createContext',
      sessionUser, orgInfo
    })
    log.info('called')
    return ContextService.createNew(sessionUser, {
      name: uuid(),
      owner: {
        github: orgInfo.githubOrgId,
        bigPoppa: orgInfo.bigPoppaOrgId
      }
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String}  contextId
   * @param  {Object}  orgInfo
   * @param  {Object}  orgInfo.githubOrgId
   * @param  {Object}  orgInfo.bigPoppaOrgId
   * @param  {String}  fullRepoName
   * @return {ContextVersion}
   */
  static _createParentContextVersion (sessionUser, contextId, orgInfo, fullRepoName, buildDockerfilePath) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentContextVersion',
      sessionUser, contextId, orgInfo, fullRepoName
    })
    log.info('called')
    return ContextVersion.createAppcodeVersion(sessionUser, fullRepoName)
    .then((appCodeVersion) => {
      return ContextVersion.createWithNewInfraCode({
        context: contextId,
        createdBy: {
          github: sessionUser.accounts.github.id,
          bigPoppa: sessionUser.bigPoppaUser.id
        },
        owner: {
          github: orgInfo.githubOrgId,
          bigPoppa: orgInfo.bigPoppaOrgId
        },
        buildDockerfilePath,
        advance: true,
        appCodeVersions: [ appCodeVersion ]
      })
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} contextVersionId
   * @return {Build}
   */
  static _createBuild (sessionUser, contextVersionId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createBuild',
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
  static _createInstance (sessionUser, parentComposeData, parentBuildId) {
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
      method: '_createInstance',
      instanceOpts
    })
    log.info('called')

    return InstanceService.createInstance(instanceOpts, sessionUser)
  }

  /**
   * @param  {SessionUser}  sessionUser
   * @param  {Object}  parsedComposeData
   * @param  {String}  parsedComposeData.contextVersion.buildDockerfilePath
   * @param  {String}  parsedComposeData.instance.name
   * @param  {Array<String>}  parsedComposeData.instance.env
   * @param  {String}  parsedComposeData.instance.containerStartCommand
   * @param  {Object}  orgInfo
   * @param  {Object}  orgInfo.githubOrgId
   * @param  {Object}  orgInfo.bigPoppaOrgId
   * @return {Instance}
   */
  static createClusterSibling (sessionUser, parsedComposeData, orgInfo) {
    const log = DockerComposeClusterService.log.child({
      method: 'createClusterSibling',
      sessionUser, parsedComposeData
    })
    log.info('called')

    return DockerComposeClusterService._createContext(sessionUser, orgInfo)
    .then((context) => {
      return DockerComposeClusterService._createSiblingContextVersion(sessionUser, context._id, orgInfo, parsedComposeData.contextVersion.buildDockerfilePath, parsedComposeData.files['/Dockerfile'].body)
    })
    .then((contextVersion) => {
      return DockerComposeClusterService._createBuild(sessionUser, contextVersion._id)
    })
    .then((build) => {
      return DockerComposeClusterService._createInstance(sessionUser, parsedComposeData.instance, build._id)
    })
  }

  /**
   * @param  {SessionUser}  sessionUser
   * @param  {String}  contextId
   * @param  {Object}  orgInfo
   * @param  {Object}  orgInfo.githubOrgId
   * @param  {Object}  orgInfo.bigPoppaOrgId
   * @param  {String}  dockerFileContent
   * @return {ContextVersion}
   */
  static _createSiblingContextVersion (sessionUser, contextId, orgInfo, dockerFileContent) {
    const log = DockerComposeClusterService.log.child({
      method: '_createSiblingContextVersion',
      sessionUser, contextId, orgInfo, dockerFileContent
    })
    log.info('called')
    return ContextVersion.createWithDockerFileContent({
      context: contextId,
      createdBy: {
        github: sessionUser.accounts.github.id,
        bigPoppa: sessionUser.bigPoppaUser.id
      },
      owner: {
        github: orgInfo.githubOrgId,
        bigPoppa: orgInfo.bigPoppaOrgId
      },
      advance: true,
      appCodeVersions: []
    }, dockerFileContent)
  }
}
