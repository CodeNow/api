'use strict'
const uuid = require('uuid')
require('loadenv')('models/services/docker-compose-cluster-service')

const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const GitHub = require('models/apis/github')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const OrganizationService = require('models/services/organization-service')
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
    const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
    const ownerUsername = GitHub.getOrgFromFullRepoName(repoFullName)
    const repoName = GitHub.getRepoShortNameFromFullRepoName(repoFullName)
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
        return OrganizationService.getByGithubUsername(ownerUsername)
          .then(function (org) {
            const orgBigPoppaId = org.id
            const clusterOpts = {
              dockerComposeFilePath,
              createdBy: sessionUserBigPoppaId,
              ownedBy: orgBigPoppaId,
              triggeredAction
            }
            log.info({ clusterOpts }, 'new cluster data')
            return DockerComposeCluster.createAsync(clusterOpts)
              .then(function (cluster) {
                return {
                  cluster,
                  parsedCompose,
                  orgBigPoppaId
                }
              })
          })
      })
      .tap(function (resp) {
        const id = resp.cluster._id.toString()
        const orgBigPoppaId = resp.orgBigPoppaId
        rabbitMQ.clusterCreated({
          cluster: { id },
          parsedCompose: resp.parsedCompose,
          sessionUserBigPoppaId,
          orgBigPoppaId,
          triggeredAction,
          repoFullName
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
   * @param  {String} parentComposeData.name
   * @param  {Array<String>}  parentComposeData.env
   * @param  {Array<Number>}  parentComposeData.ports
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {String} fullRepoName (org/repo)
   * @return {Instance}
   */
  static createClusterParent (sessionUser, parentComposeData, fullRepoName, triggeredAction) {
    const log = DockerComposeClusterService.log.child({
      method: 'createClusterParent',
      sessionUser, parentComposeData, fullRepoName, triggeredAction
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, fullRepoName)
    const orgGithubId = bigPoppaOwnerObject.githubId
    const bigPoppaOrgId = bigPoppaOwnerObject.id

    return DockerComposeClusterService._createParentContext(sessionUser, bigPoppaOrgId, orgGithubId)
    .then((context) => {
      log.info({ context }, 'context created')
      return DockerComposeClusterService._createParentContextVersion(sessionUser, context._id, orgGithubId, fullRepoName)
    })
    .then((contextVersion) => {
      log.info({ contextVersion }, 'cv created')
      return DockerComposeClusterService._createParentBuild(sessionUser, contextVersion._id, orgGithubId)
    })
    .then((build) => {
      return BuildService.buildBuild(build._id, {
        message: 'Initial Cluster Creation',
        triggeredAction: {
          manual: triggeredAction === 'user'
        },
        triggeredBy: {
          github: sessionUser.accounts.github.id
        }
      }, sessionUser).return(build)
    })
    .then((build) => {
      log.info({ build }, 'build created')
      const buildId = keypather.get(build, '_id.toString()')
      return DockerComposeClusterService._createParentInstance(sessionUser, parentComposeData, buildId)
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} orgGithubId
   * @return {Context}
   */
  static _createParentContext (sessionUser, bigPoppaOrgId, orgGithubId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentContext',
      sessionUser, bigPoppaOrgId, orgGithubId
    })
    log.info('called')
    return ContextService.createNew(sessionUser, {
      name: uuid(),
      owner: {
        // TODO: remove github during bp migration
        github: orgGithubId,
        bigPoppa: bigPoppaOrgId
      }
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
      log.info({ appCodeVersion }, 'appCodeVersion created')
      return ContextVersion.createWithNewInfraCodeAsync({
        context: contextId,
        createdBy: {
          github: sessionUser.accounts.github.id
        },
        owner: {
          github: orgGithubId
        },
        appCodeVersions: [ appCodeVersion ]
      })
    })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} contextVersionId
   * @param  {String} orgGithubId
   * @return {Build}
   */
  static _createParentBuild (sessionUser, contextVersionId, orgGithubId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createParentBuild',
      sessionUser, contextVersionId
    })
    log.info('called')
    return BuildService.createBuild({
      createdBy: {
        github: sessionUser.accounts.github.id
      },
      owner: {
        github: orgGithubId
      },
      contextVersion: contextVersionId
    }, sessionUser)
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object} parentComposeData
   * @param  {String} parentComposeData.name
   * @param  {Array<String>}  parentComposeData.env
   * @param  {Array<Number>}  parentComposeData.ports
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {ObjectId} parentBuildId
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createParentInstance (sessionUser, parentComposeData, parentBuildId) {
    const composeInstanceOpst = parentComposeData.instance
    const defaultInstanceOpst = {
      build: parentBuildId,
      isTesting: false,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      }
    }
    const instanceOpts = Object.assign({}, defaultInstanceOpst, composeInstanceOpst)
    const log = DockerComposeClusterService.log.child({
      method: 'createParentInstance',
      instanceOpts
    })
    log.info('called')

    return InstanceService.createInstance(instanceOpts, sessionUser)
  }
}
