'use strict'
require('loadenv')('models/services/cluster-config-service')

const hasKeypaths = require('101/has-keypaths')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const Promise = require('bluebird')
const uuid = require('uuid')
const pick = require('101/pick')

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const InputClusterConfig = require('models/mongo/input-cluster-config')

const GitHub = require('models/apis/github')
const AutoIsolationService = require('models/services/auto-isolation-service')
const InfraCodeVersionService = require('models/services/infracode-version-service')
const InstanceService = require('models/services/instance-service')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')

module.exports = class ClusterConfigService {
  static get log () {
    return logger.child({
      module: 'ClusterConfigService'
    })
  }

  /**
   * Create Docker Compose Cluster
   * - fetch compose file content from github
   * - parse compose content
   * - call createFromRunnableConfig
   * @param {Object} sessionUser - session user full object
   * @param {Object} data - cluster data
   * @param {String} data.triggeredAction - action that triggered creation
   * @param {String} data.repoFullName - full repo name E.x. Runnable/api
   * @param {String} data.branchName - branch name
   * @param {String} data.filePath - path to the cluster config file
   * @param {Boolean} data.isTesting - is this testing cluster
   * @param {String} data.newInstanceName - optional new instance name
   * @return {Promise} with object that has AutoIsolationConfig
   */
  static create (sessionUser, data) {
    const log = ClusterConfigService.log.child({
      method: 'create',
      sessionUser,
      data
    })
    log.info('called')
    const filePath = data.filePath
    const repoFullName = data.repoFullName
    const token = keypather.get(sessionUser, 'accounts.github.accessToken')
    const ownerUsername = GitHub.getOrgFromFullRepoName(repoFullName)
    const repoName = GitHub.getRepoShortNameFromFullRepoName(repoFullName)
    const github = new GitHub({ token })
    return github.getRepoContentAsync(repoFullName, filePath)
      .then(function (fileContent) {
        log.trace({ fileContent }, 'content response')
        const base64Content = fileContent.content
        const buf = new Buffer(base64Content, 'base64')
        const dockerComposeFileString = buf.toString()

        log.info({ dockerComposeFileString }, 'content response')
        const parseInput = {
          dockerComposeFileString,
          repositoryName: data.newInstanceName || repoName,
          ownerUsername,
          userContentDomain: process.env.USER_CONTENT_DOMAIN
        }
        log.trace({ parseInput }, 'octobear input')
        return octobear.parse(parseInput)
          .then(function (parsedCompose) {
            log.trace({ parsedCompose }, 'parsed compose')
            return ClusterConfigService.createFromRunnableConfig(
              sessionUser,
              parsedCompose,
              data.triggeredAction,
              repoFullName,
              filePath,
              fileContent.sha,
              data.isTesting
            )
          })
      })
  }

  /**
   * Create Cluster from parsed runnable config
   * - create new instance for each defined in the config
   * - create AutoIsolationConfig and emit `auto-isolation-config.created`
   * - create InputClusterConfig model with a link to AutoIsolationConfig
   * @param {Object}  sessionUser     - session user full object
   * @param {Object}  runnableConfig  - parsed runnable config
   * @param {String}  triggeredAction - action that triggered creation
   * @param {String}  repoFullName    - full repo name E.x. Runnable/api
   * @param {String}  filePath        - path to the cluster config file
   * @param {String}  fileSha         - md5 hash of the file
   * @param {Boolean} isTesting       - isTesting cluster
   * @return {Promise} with object that has AutoIsolationConfig
   */
  static createFromRunnableConfig (sessionUser, runnableConfig, triggeredAction, repoFullName, filePath, fileSha, isTesting) {
    const log = ClusterConfigService.log.child({
      method: 'create',
      sessionUser,
      triggeredAction,
      runnableConfig,
      repoFullName, filePath, isTesting
    })
    log.info('called')
    const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
    const organization = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    const parsedInstancesDef = runnableConfig.results
    return Promise.map(parsedInstancesDef, (instanceDef) => {
      return ClusterConfigService.createClusterInstance(sessionUser, instanceDef, repoFullName, isTesting, triggeredAction)
        .then((instance) => {
          return {
            instanceDef,
            instance
          }
        })
    })
      .then((newInstancesObjs) => {
        const mainInstanceObj = newInstancesObjs.find((instanceObj) => {
          return instanceObj.instanceDef.metadata.isMain
        })
        const dependenciesObjs = newInstancesObjs.filter((instanceObj) => {
          return !instanceObj.instanceDef.metadata.isMain
        })
        const mainInstanceId = mainInstanceObj.instance._id
        const requestedDependencies = dependenciesObjs.map((instanceObj) => {
          const dep = {
            instance: instanceObj.instance._id
          }
          // if files provided -> it is not repo instance
          const isRepoInstance = !keypather.get(instanceObj, 'instanceDef.files')
          if (isRepoInstance) {
            dep.matchBranch = true
          }
          return dep
        })
        const autoIsolationOpts = {
          createdByUser: sessionUserBigPoppaId,
          ownedByOrg: organization.id,
          instance: mainInstanceId,
          requestedDependencies
        }
        return AutoIsolationService.createAndEmit(autoIsolationOpts)
          .then((autoIsolationConfig) => {
            return InputClusterConfig.createAsync({
              autoIsolationConfigId: autoIsolationConfig._id,
              filePath,
              fileSha,
              createdByUser: sessionUserBigPoppaId,
              ownedByOrg: organization.id
            })
          })
      })
  }

  /**
   * Delete cluster:
   * - do not delete parentInstance
   * - create job to delete each instance
   * - mark cluster as deleted
   * @param {ObjectId} clusterId - id of the cluster
   */
  static delete (clusterId) {
    const log = ClusterConfigService.log.child({
      method: 'delete',
      clusterId
    })
    log.info('called')
    return AutoIsolationConfig.findByIdAndAssert(clusterId)
      .tap(function (cluster) {
        const instancesIds = cluster.instancesIds || []
        instancesIds.forEach(function (instanceId) {
          rabbitMQ.deleteInstance({ instanceId })
        })
      })
      .tap(function (cluster) {
        return InputClusterConfig.markAsDeleted(cluster._id)
      })
      .tap(function (cluster) {
        rabbitMQ.clusterDeleted({ cluster: { id: clusterId } })
      })
  }

  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object} parsedInstanceData
   * @param  {String} parsedInstanceData.contextVersion.buildDockerfilePath
   * @param  {String} parsedInstanceData.instance.name
   * @param  {Array<String>}  parsedInstanceData.instance.env
   * @param  {String}  parsedInstanceData.instance.containerStartCommand
   * @param  {String} repoFullName (org/repo)
   * @param  {Boolean} isTesting
   * @param  {String} triggeredAction
   * @return {Instance}
   */
  static createClusterInstance (sessionUser, parsedInstanceData, repoFullName, isTesting, triggeredAction) {
    const log = ClusterConfigService.log.child({
      method: 'createClusterInstance',
      sessionUser, parsedInstanceData, repoFullName, isTesting, triggeredAction
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }

    return ClusterConfigService._createContext(sessionUser, orgInfo)
    .then((context) => {
      log.trace({ context }, 'context created')
      return ClusterConfigService._createContextVersion(sessionUser, context._id, orgInfo, repoFullName, parsedInstanceData)
    })
    .then((contextVersion) => {
      log.trace({ contextVersion }, 'cv created')
      return ClusterConfigService._createBuild(sessionUser, contextVersion._id, orgInfo.githubOrgId)
    })
    .then(ClusterConfigService._buildBuild(sessionUser, triggeredAction))
    .then((build) => {
      log.trace({ build }, 'build created')
      const buildId = keypather.get(build, '_id.toString()')
      return ClusterConfigService._createInstance(sessionUser, parsedInstanceData.instance, buildId, isTesting)
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
    const log = ClusterConfigService.log.child({
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
   * @param  {Object} parsedConfigData
   * @param  {Object} parsedConfigData.files
   * @param  {Object} parsedConfigData.contextVersion
   * @param  {Boolean} parsedConfigData.contextVersion.advanced
   * @param  {String} parsedConfigData.contextVersion.buildDockerfilePath
   * @return {ContextVersion}
   */
  static _createContextVersion (sessionUser, contextId, orgInfo, repoName, parsedConfigData) {
    const log = ClusterConfigService.log.child({
      method: '_createContextVersion',
      sessionUser, contextId, orgInfo, repoName, parsedConfigData
    })
    log.info('called')
    return InfraCodeVersionService.findBlankInfraCodeVersion()
      .then((parentInfaCodeVersion) => {
        log.trace({ infraCodeVersion: parentInfaCodeVersion }, 'found parent infracode version')
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
          advanced: true
        }
        log.trace({ cvOpts }, 'new cv opts')
        if (parsedConfigData.files && parsedConfigData.files['/Dockerfile']) {
          const dockerFileContent = parsedConfigData.files['/Dockerfile'].body
          return ContextVersion.createWithDockerFileContent(cvOpts, dockerFileContent, { parent: parentInfaCodeVersion._id, edited: true })
        }
        return ContextVersion.createAppcodeVersion(sessionUser, repoName)
        .then((appCodeVersion) => {
          log.info({ appCodeVersion }, 'appCodeVersion created')
          cvOpts.appCodeVersions = [ appCodeVersion ]
          const buildDockerfilePath = parsedConfigData.contextVersion.buildDockerfilePath
          if (buildDockerfilePath) {
            cvOpts.buildDockerfilePath = buildDockerfilePath
          }
          return ContextVersion.createWithNewInfraCode(cvOpts, { parent: parentInfaCodeVersion._id, edited: true })
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
    const log = ClusterConfigService.log.child({
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
   * @param  {Object} configData
   * @param  {String} configData.name
   * @param  {Array<String>}  configData.env
   * @param  {String}  configData.containerStartCommand
   * @param  {ObjectId} parentBuildId
   * @param  {Boolean} isTesting
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createInstance (sessionUser, configData, parentBuildId, isTesting) {
    const inputInstanceOpts = pick(configData, ['env', 'containerStartCommand', 'name', 'ports'])
    const defaultInstanceOpts = {
      build: parentBuildId,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      },
      isTesting
    }
    const instanceOpts = Object.assign({}, defaultInstanceOpts, inputInstanceOpts)
    const log = ClusterConfigService.log.child({
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
      return ClusterConfigService._mergeConfigsIntoInstances(newConfigs, instancesInCluster)
    })
    .each(ClusterConfigService._deleteInstanceIfMissingConfig)
    .each(ClusterConfigService._updateAndRebuildInstancesWithConfigs)
    .each((instance) => {
      return ClusterConfigService._createNewInstancesForNewConfigs(instance, bigPoppaOrgId)
    })
  }

  /**
   * @param  {Object[]} configs
   * @param  {Instance[]} instances
   * @return {Instance[]}
   */
  static _mergeConfigsIntoInstances (configs, instances) {
    const mergedInstances = ClusterConfigService._addConfigToInstances(configs, instances)
    return ClusterConfigService._addMissingConfigs(configs, mergedInstances)
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
      if (ClusterConfigService._isConfigMissingInstance(mergedInstances, config)) {
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
  static _createNewInstancesForNewConfigs (instance, bigPoppaOrgId) {
    if (!instance.name && instance.config) {
      // rabbitMQ.createClusterInstance({
      //   parsedComposeData: instance.config,
      //   bigPoppaOrgId
      // })
    }
  }
}
