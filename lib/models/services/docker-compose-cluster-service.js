'use strict'
require('loadenv')('models/services/docker-compose-cluster-service')
const hasKeypaths = require('101/has-keypaths')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const Promise = require('bluebird')
const uuid = require('uuid')
const pick = require('101/pick')

const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const GitHub = require('models/apis/github')
const InfraCodeVersionService = require('models/services/infracode-version-service')
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
        const organization = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
        const clusterOpts = {
          dockerComposeFilePath,
          createdByUser: sessionUserBigPoppaId,
          ownedByOrg: organization.id,
          triggeredAction
        }
        log.info({ clusterOpts }, 'new cluster data')
        return DockerComposeCluster.createAsync(clusterOpts)
          .then(function (cluster) {
            return {
              cluster,
              parsedCompose,
              organization
            }
          })
      })
      .tap(function (resp) {
        const id = resp.cluster._id.toString()
        const organizationId = resp.organization.id
        rabbitMQ.clusterCreated({
          cluster: { id },
          parsedCompose: resp.parsedCompose,
          sessionUserBigPoppaId,
          organization: {
            id: organizationId
          },
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
        const instancesIds = cluster.instancesIds || []
        instancesIds.forEach(function (instanceId) {
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
   * @param  {Object} parsedComposeData
   * @param  {String} parsedComposeData.contextVersion.buildDockerfilePath
   * @param  {String} parsedComposeData.instance.name
   * @param  {Array<String>}  parsedComposeData.instance.env
   * @param  {String}  parsedComposeData.instance.containerStartCommand
   * @param  {String} fullRepoName (org/repo)
   * @return {Instance}
   */
  static createClusterInstance (sessionUser, parsedComposeData, fullRepoName, triggeredAction) {
    const log = DockerComposeClusterService.log.child({
      method: 'createClusterInstance',
      sessionUser, parsedComposeData, fullRepoName, triggeredAction
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, fullRepoName)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }

    return DockerComposeClusterService._createContext(sessionUser, orgInfo)
    .then((context) => {
      log.info({ context }, 'context created')
      return DockerComposeClusterService._createContextVersion(sessionUser, context._id, orgInfo, fullRepoName, parsedComposeData)
    })
    .then((contextVersion) => {
      log.info({ contextVersion }, 'cv created')
      return DockerComposeClusterService._createBuild(sessionUser, contextVersion._id, orgInfo.githubOrgId)
    })
    .then(DockerComposeClusterService._buildBuild(sessionUser, triggeredAction))
    .then((build) => {
      log.info({ build }, 'build created')
      const buildId = keypather.get(build, '_id.toString()')
      return DockerComposeClusterService._createInstance(sessionUser, parsedComposeData.instance, buildId)
    })
  }

  static _buildBuild (sessionUser, triggeredAction) {
    return function (build) {
      const buildsOpts = {
        message: 'Initial Cluster Creation',
        noCache: true,
        triggeredAction: {
          manual: triggeredAction === 'user'
        }
      }
      return BuildService.buildBuild(build._id, buildsOpts, sessionUser)
    }
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
   * @param  {String} contextId
   * @param  {Object}  orgInfo
   * @param  {Object}  orgInfo.githubOrgId
   * @param  {Object}  orgInfo.bigPoppaOrgId
   * @param  {String} repoName
   * @param  {Object} parsedComposeData
   * @param  {Object} parsedComposeData.files
   * @param  {Object} parsedComposeData.contextVersion
   * @param  {Boolean} parsedComposeData.contextVersion.advanced
   * @param  {String} parsedComposeData.contextVersion.buildDockerfilePath
   * @return {ContextVersion}
   */
  static _createContextVersion (sessionUser, contextId, orgInfo, repoName, parsedComposeData) {
    const log = DockerComposeClusterService.log.child({
      method: '_createContextVersion',
      sessionUser, contextId, orgInfo, repoName, parsedComposeData
    })
    log.info('called')
    return InfraCodeVersionService.findBlankInfraCodeVersion()
      .then((parentInfaCodeVersion) => {
        log.info({ infraCodeVersion: parentInfaCodeVersion }, 'found parent infracode version')
        return ContextVersion.createAppcodeVersion(sessionUser, repoName)
        .then((appCodeVersion) => {
          log.info({ appCodeVersion }, 'appCodeVersion created')
          const cvOpts = {
            context: contextId,
            createdBy: {
              github: sessionUser.accounts.github.id,
              bigPoppa: sessionUser.bigPoppaUser.id
            },
            owner: {
              github: orgInfo.githubOrgId,
              bigPoppa: orgInfo.bigPoppaOrgId
            },
            appCodeVersions: [ appCodeVersion ],
            advanced: true
          }
          log.info({ cvOpts }, 'new cv opts')
          if (parsedComposeData.files && parsedComposeData.files['/Dockerfile']) {
            const dockerFileContent = parsedComposeData.files['/Dockerfile'].body
            return ContextVersion.createWithDockerFileContent(cvOpts, dockerFileContent, { parent: parentInfaCodeVersion._id, edited: true })
          }
          const buildDockerfilePath = parsedComposeData.contextVersion.buildDockerfilePath
          if (buildDockerfilePath) {
            cvOpts.buildDockerfilePath = buildDockerfilePath
          }
          return ContextVersion.createWithNewInfraCode(cvOpts, { parent: parentInfaCodeVersion._id })
        })
      })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {String} contextVersionId
   * @param  {String} orgGithubId
   * @return {Build}
   */
  static _createBuild (sessionUser, contextVersionId, orgGithubId) {
    const log = DockerComposeClusterService.log.child({
      method: '_createBuild',
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
   * @param  {String}  parentComposeData.containerStartCommand
   * @param  {ObjectId} parentBuildId
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createInstance (sessionUser, parentComposeData, parentBuildId) {
    const composeInstanceOpst = pick(parentComposeData, ['env', 'containerStartCommand', 'name', 'ports'])
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
      method: '_createInstance',
      instanceOpts
    })
    log.info('called')

    return InstanceService.createInstance(instanceOpts, sessionUser)
  }

  /**
   * @param  {Object[]} newConfigs
   * @param  {Instance[]} instancesInCluster
   * @param  {String} bigPoppaOrgId
   * @return {undefined}
   */
  static updateCluster (newConfigs, instancesInCluster, bigPoppaOrgId) {
    return Promise.try(() => {
      return DockerComposeClusterService._mergeConfigsIntoInstances(newConfigs, instancesInCluster)
    })
    .each(DockerComposeClusterService._deleteInstanceIfMissingConfig)
    .each(DockerComposeClusterService._updateAndRebuildInstancesWithConfigs)
    .each((instance) => {
      return DockerComposeClusterService._createNewSiblingsForNewConfigs(instance, bigPoppaOrgId)
    })
  }

  /**
   * @param  {Object[]} configs
   * @param  {Instance[]} instances
   * @return {Instance[]}
   */
  static _mergeConfigsIntoInstances (configs, instances) {
    const mergedInstances = DockerComposeClusterService._addConfigToInstances(configs, instances)
    return DockerComposeClusterService._addMissingConfigs(configs, mergedInstances)
  }

  /**
   * @param {Object[]} configs
   * @param {Instance[]} instances
   */
  static _addConfigToInstances (configs, instances) {
    return instances.map((instance) => {
      instance.config = configs.find(hasKeypaths({ 'instance.name': instance.name }))
      return instance
    })
  }
  /**
   * @param {Object[]} configs
   * @param {Instance[]} mergedInstances
   */
  static _addMissingConfigs (configs, mergedInstances) {
    configs.forEach((config) => {
      if (DockerComposeClusterService._isConfigMissingInstance(mergedInstances, config)) {
        mergedInstances.push({ config })
      }
    })
    return mergedInstances
  }

  /**
   * @param  {Instance[]}  instances
   * @param  {Object}  config
   * @return {Boolean} true if config does not correspond to an instance
   */
  static _isConfigMissingInstance (instances, config) {
    return !instances.find(hasKeypaths({
      'name': config.instance.name
    }))
  }

  /**
   * @param  {Instance} instance
   * @return {undefined}
   */
  static _deleteInstanceIfMissingConfig (instance) {
    if (!instance.config) {
      rabbitMQ.deleteInstance({ instanceId: instance._id })
    }
  }

  /**
   * @param  {Instance} instance
   * @return {undefined}
   */
  static _updateAndRebuildInstancesWithConfigs (instance) {
    if (instance.config && instance.name) {
      return instance.updateAsync({
        $set: {
          env: instance.config.instance.env,
          containerStartCommand: instance.config.instance.containerStartCommand
        }
      })
      .tap(() => {
        rabbitMQ.publishInstanceRebuild({ instanceId: instance._id })
      })
      .return(undefined)
    }
  }

  /**
   * @param  {Object}  instance
   * @param  {String}  bigPoppaOrgId
   * @return {undefined}
   */
  static _createNewSiblingsForNewConfigs (instance, bigPoppaOrgId) {
    if (!instance.name && instance.config) {
      rabbitMQ.createClusterInstance({
        parsedComposeData: instance.config,
        bigPoppaOrgId
      })
    }
  }
}
