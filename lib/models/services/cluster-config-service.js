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
const Instance = require('models/mongo/instance')
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
   * @param {User}    sessionUser          - session user full object
   * @param {Object}  data                 - cluster data
   * @param {String}  data.triggeredAction - action that triggered creation
   * @param {String}  data.repoFullName    - full repo name E.x. Runnable/api
   * @param {String}  data.branchName      - branch name
   * @param {String}  data.filePath        - path to the cluster config file
   * @param {Boolean} data.isTesting       - is this testing cluster
   * @param {String}  data.newInstanceName - optional new instance name
   *
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
    const bigPoppaUser = sessionUser.bigPoppaUser
    return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, filePath)
      .then(parseInput => {
        const instanceName = data.newInstanceName || GitHub.getRepoShortNameFromFullRepoName(repoFullName)
        return ClusterConfigService.parseComposeFileAndPopulateENVs(parseInput, repoFullName, instanceName, sessionUser)
          .then(parsedCompose => {
            log.trace({ parsedCompose }, 'parsed compose')
            return ClusterConfigService.createFromRunnableConfig(
              sessionUser,
              parsedCompose,
              data.triggeredAction,
              repoFullName,
              filePath,
              parseInput.fileSha,
              instanceName,
              data.isTesting,
              data.testReporters
            )
          })
      })
  }

  /**
   * Create Cluster from parsed runnable config
   * - create new instance for each defined in the config
   * - create AutoIsolationConfig and emit `auto-isolation-config.created`
   * - create InputClusterConfig model with a link to AutoIsolationConfig
   * @param {SessionUser} sessionUser     - session user full object
   * @param {Object}      runnableConfig  - parsed runnable config
   * @param {String}      triggeredAction - action that triggered creation
   * @param {String}      repoFullName    - full repo name E.x. Runnable/api
   * @param {String}      filePath        - path to the cluster config file
   * @param {Object}      composeFileData - parsed data from the compose file
   * @param {String}      fileSha         - md5 hash of the file
   * @param {String}      repositoryName  - name for the cluster
   * @param {Boolean}     isTesting       - isTesting cluster
   * @return {Promise}    with object that has AutoIsolationConfig
   */
  static createFromRunnableConfig (sessionUser, runnableConfig, triggeredAction, repoFullName, filePath, fileSha, repositoryName, isTesting, testReporters) {
    const log = ClusterConfigService.log.child({
      method: 'create',
      sessionUser,
      triggeredAction,
      runnableConfig,
      repoFullName,
      filePath,
      isTesting,
      testReporters
    })
    log.info('called')
    const sessionUserBigPoppaId = keypather.get(sessionUser, 'bigPoppaUser.id')
    const organization = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    const parsedInstancesDef = runnableConfig.results
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }
    return Promise
      .each(parsedInstancesDef, instanceDef => {
        return ClusterConfigService.createClusterContext(sessionUser, instanceDef, orgInfo)
        // Instance defs now contain the contexts
      })
      .tap(ClusterConfigService.addAliasesToContexts)
      .map(instanceDef => ClusterConfigService._createNewInstancesForNewConfigs(
        sessionUser,
        instanceDef,
        repoFullName,
        isTesting,
        testReporters,
        triggeredAction
      ))
      .then(ClusterConfigService._createAutoIsolationModelsFromClusterInstances)
      .then(autoIsolationOpts => {
        autoIsolationOpts.createdByUser = sessionUserBigPoppaId
        autoIsolationOpts.ownedByOrg = organization.id
        return AutoIsolationService.createOrUpdateAndEmit(autoIsolationOpts)
          .then((autoIsolationConfig) => {
            return InputClusterConfig.createAsync({
              autoIsolationConfigId: autoIsolationConfig._id,
              filePath,
              fileSha,
              createdByUser: sessionUserBigPoppaId,
              ownedByOrg: organization.id,
              clusterName: repositoryName
            })
          })
      })
  }

  /**
   * Creates models that can be used to save the OctoBear config as an AutoIsolationConfig
   *
   * @param {Object[]} instancesWithConfigs                        - instances with OctoBear configurations
   * @param {Instance} instancesWithConfigs.instance               - instance
   * @param {ObjectId} instancesWithConfigs.instance._id           - instance id
   * @param {Object}   instancesWithConfigs.config                 - OctoBear configuration
   * @param {Object}   instancesWithConfigs.config.metadata.isMain - True if this is the main instance
   * @param {Object}   instancesWithConfigs.config.files           - If this is falsy, the dep
   *                                                                     should match the branch
   * @returns {Object}   model
   * @returns {ObjectId} model.instance                          - instanceId of the main instance
   * @returns {Object[]} model.requestedDependencies             - Array of models with instanceIds
   *                                                                  of deps to copy
   * @returns {ObjectId} model.requestedDependencies.instance    - Id of the instance to match
   * @returns {Boolean}  model.requestedDependencies.matchBranch - True if the copies should match
   *                                                                  the branch of the master
   * @private
   */
  static _createAutoIsolationModelsFromClusterInstances (instancesWithConfigs) {
    const log = ClusterConfigService.log.child({
      method: '_createAutoIsolationModelsFromClusterInstances',
      instancesWithConfigs
    })
    log.info('called')
    const mainInstanceObj = instancesWithConfigs.find((instanceObj) => {
      return instanceObj.config.metadata.isMain
    })
    const dependenciesObjs = instancesWithConfigs.filter((instanceObj) => {
      return !instanceObj.config.metadata.isMain
    })
    const mainInstanceId = mainInstanceObj.instance._id
    const requestedDependencies = dependenciesObjs.map((instanceObj) => {
      const dep = {
        instance: instanceObj.instance._id
      }
      // if files provided -> it is not repo instance
      const isRepoInstance = !keypather.get(instanceObj, 'config.files')
      if (isRepoInstance) {
        dep.matchBranch = true
      }
      return dep
    })

    const model = {
      instance: mainInstanceId,
      requestedDependencies
    }
    log.info({ model }, 'model created')
    return model
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
      .tap(cluster => {
        const instancesIds = cluster.instancesIds || []
        instancesIds.forEach(instanceId => {
          rabbitMQ.deleteInstance({ instanceId })
        })
      })
      .tap(cluster => {
        return InputClusterConfig.markAsDeleted(cluster._id)
      })
      .tap(cluster => {
        rabbitMQ.clusterDeleted({ cluster: { id: clusterId } })
      })
  }

  /**
   * Given an Octobear Results array, add the contextId to each alias model that matches up with it.
   * Aliases have the instanceName in them, so we store all the configs by name to reference them
   * easier
   * @param {Object[]} instanceConfigs
   * @param {ObjectId} instanceConfigs.contextId
   * @param {Object}   instanceConfigs.instance.aliases
   * @param {String}   instanceConfigs.instance.name
   *
   * @returns {undefined}
   */
  static addAliasesToContexts (instanceConfigs) {
    const log = ClusterConfigService.log.child({
      method: 'addAliasesToContexts'
    })
    log.info('called')
    if (!instanceConfigs) {
      return
    }
    // save the instance names by name for processing
    const dict = instanceConfigs
      .reduce((map, instanceConfig) => Object.assign(map, {[instanceConfig.instance.name]: instanceConfig}), {})
    log.info({ dict: Object.keys(dict) }, 'Dictionary created')

    instanceConfigs.forEach(instanceConfig => {
      const aliases = keypather.get(instanceConfig, 'instance.aliases')
      if (!aliases) { return }

      Object.keys(aliases).forEach(key => {
        let instanceName = aliases[key].instanceName
        if (dict[instanceName]) {
          aliases[key].contextId = dict[instanceName].contextId
        }
      })
    })
  }

  /**
   * Creates the Context object for the given parsedInstanceData, attaches the new context id to the
   * parsedInstanceData, and then resolves the data back
   *
   * @param {SessionUser} sessionUser
   * @param {Object}      parsedInstanceData
   * @param {Object}      parsedInstanceData.contextId      - This is filled in here
   * @param {String}      parsedInstanceData.instance.name
   * @param {Object}      orgInfo
   * @param {String}      orgInfo.githubOrgId
   * @param {String}      orgInfo.bigPoppaOrgId
   *
   * @resolves {parsedInstanceData} Original data given, but with the contextId attached
   */
  static createClusterContext (sessionUser, parsedInstanceData, orgInfo) {
    const log = ClusterConfigService.log.child({
      method: 'createClusterContext',
      sessionUser
    })
    log.info('called')

    return ClusterConfigService._createContext(sessionUser, orgInfo)
      .then(context => {
        parsedInstanceData.contextId = context._id
      })
      .return(parsedInstanceData)
  }

  /**
   * CONTEXT MUST BE CREATED BEFORE USING THIS.  The contextId must be in the config!
   * @param {SessionUser} sessionUser
   * @param {Object}      parsedInstanceData
   * @param {ObjectId}    parsedInstanceData.contextId
   * @param {String}      parsedInstanceData.contextVersion.buildDockerfilePath
   * @param {String}      parsedInstanceData.instance.name
   * @param {String[]}    parsedInstanceData.instance.env
   * @param {String}      parsedInstanceData.instance.containerStartCommand
   * @param {String}      repoFullName (org/repo)
   * @param {Boolean}     isTesting
   * @param {String}      triggeredAction
   * @resolves {Instance}
   */
  static createClusterInstance (sessionUser, parsedInstanceData, repoFullName, isTesting, isTestReporter, triggeredAction) {
    const log = ClusterConfigService.log.child({
      method: 'createClusterInstance',
      sessionUser, parsedInstanceData, repoFullName, isTesting, isTestReporter, triggeredAction
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }
    return Promise.try(() => {
      if (!parsedInstanceData.contextId) {
        log.error('Create Cluster attempted to create an instance without a context!', { parsedInstanceData })
        throw new Instance.CreateFailedError('Create Cluster failed because it was missing a contextId', { parsedInstanceData })
      }
    })
      .then(function () {
        return ClusterConfigService._createContextVersion(sessionUser, parsedInstanceData.contextId, orgInfo, repoFullName, parsedInstanceData)
      })
      .then((contextVersion) => {
        log.trace({ contextVersion }, 'cv created')
        return ClusterConfigService._createBuild(sessionUser, contextVersion._id, orgInfo.githubOrgId)
      })
      .then(ClusterConfigService._buildBuild(sessionUser, triggeredAction))
      .then((build) => {
        log.trace({ build }, 'build created')
        const buildId = keypather.get(build, '_id.toString()')
        return ClusterConfigService._createInstance(sessionUser, parsedInstanceData.instance, buildId, isTesting, isTestReporter)
      })
  }

  static _buildBuild (sessionUser, triggeredAction) {
    return build => {
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
   * @return   {Promise}
   * @resolves {Context}
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
   * @param {SessionUser} sessionUser
   * @param {ObjectId}    contextId
   * @param {Object}      orgInfo
   * @param {String}      orgInfo.githubOrgId
   * @param {String}      orgInfo.bigPoppaOrgId
   * @param {String}      repoName
   * @param {Object}      parsedConfigData
   * @param {Object}      parsedConfigData.files
   * @param {Object}      parsedConfigData.contextVersion
   * @param {Boolean}     parsedConfigData.contextVersion.advanced
   * @param {String}      parsedConfigData.contextVersion.buildDockerfilePath
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
        if (!keypather.get(parsedConfigData, 'metadata.isMain') && keypather.get(parsedConfigData, 'files[\'/Dockerfile\']')) {
          return ClusterConfigService._createDockerfileContent(parsedConfigData, cvOpts, parentInfaCodeVersion)
        }
        log.trace({parsedConfigData}, 'parsedConfigData for Henry')
        return ContextVersion.createAppcodeVersion(sessionUser, repoName)
        .then((appCodeVersion) => {
          log.info({ appCodeVersion }, 'appCodeVersion created')
          cvOpts.appCodeVersions = [ appCodeVersion ]
          if (keypather.get(parsedConfigData, 'files[\'/Dockerfile\']')) {
            return ClusterConfigService._createDockerfileContent(parsedConfigData, cvOpts, parentInfaCodeVersion)
          }
          const buildDockerfilePath = parsedConfigData.contextVersion.buildDockerfilePath
          if (buildDockerfilePath) {
            cvOpts.buildDockerfilePath = buildDockerfilePath
          }
          return ContextVersion.createWithNewInfraCode(cvOpts, { parent: parentInfaCodeVersion._id, edited: true })
        })
      })
  }

  /**
   * @param  {User}   sessionUser
   * @param  {String} contextVersionId
   * @param  {String} orgGithubId
   * @return  {Promise}
   * @resolve {Build}
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
  static _createInstance (sessionUser, configData, parentBuildId, isTesting, isTestReporter) {
    const inputInstanceOpts = pick(configData, ['aliases', 'env', 'containerStartCommand', 'name', 'ports'])
    const defaultInstanceOpts = {
      build: parentBuildId,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      },
      isTesting,
      isTestReporter
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
   * Given an instance-like model, update the list of dependent instances with what should be in the
   * Isolation Config.  If the config is missing, we need to delete the instance.  If the name is
   * missing, we need to create the instance.  If both are there, we just need to update them.  This
   * returns an array of all the instances which should be in the dependency list for the
   * AutoIsolation update
   *
   * @param {SessionUser} sessionUser            - User model for the an owner with permission
   * @param {Object[]}    instanceObjs           - Dependent Instance (or empty model with config)
   * @param {Object}      instanceObjs.config    - Octobear config info (should delete instance if missing)
   * @param {Instance}    instanceObjs.instance  - Instance model (should create instance if missing)
   * @param {Instance}    mainInstance           - Main instance of this cluster
   * @param {ObjectId}    mainInstance._id       - Main instance's id
   * @param {Boolean}     mainInstance.isTesting - True if the instance is a testing instance
   * @param {Object}      githubPushInfo         - Model containing GitHub push data
   * @param {String}      githubPushInfo.repo    - Full Repository Name (owner/repo)
   * @param {String}      githubPushInfo.branch  - Current branch this instance should be on
   * @param {String}      githubPushInfo.commit  - New commit this instance should be on
   * @param {Object}      githubPushInfo.user    - Model containing the pusher's data
   * @param {Number}      githubPushInfo.user.id - GitHub ID for the pusher
   *
   * @returns {Promise}
   * @resolves {Instance[]} Instances which represent the requested dependencies for this isolation
   * @private
   */
  static _createUpdateAndDeleteInstancesForClusterUpdate (sessionUser, instanceObjs, mainInstance, githubPushInfo) {
    const log = ClusterConfigService.log.child({
      method: '_createUpdateAndDeleteInstancesForClusterUpdate',
      sessionUser, instanceObjs, mainInstance, githubPushInfo
    })
    const createInstancePromises = []
    const updateInstances = []
    instanceObjs.forEach(instanceObj => {
      if (instanceObj.config) {
        if (instanceObj.instance) {
          // if the instance and config exist, then we know we need to update
          return updateInstances.push(instanceObj)
        }
        // No instance means create a new one
        // We need to create new instances first, so when we update them, the connections can be made
        return createInstancePromises.push(ClusterConfigService._createNewInstancesForNewConfigs(
          sessionUser,
          instanceObj.config,
          githubPushInfo.repo,
          mainInstance.isTesting,
          'autoDeploy'
        ))
      }
      const deletedId = keypather.get(instanceObj, 'instance._id.toString()')
      // With no config, we delete the instanceObj
      log.info({instanceId: deletedId}, 'deleting instanceObj')
      return rabbitMQ.deleteInstance({instanceId: deletedId})
    })
    return Promise
      .all(createInstancePromises) // Make sure creates happen first
      .then(newInstanceObjs => {
        return Promise
          .map(updateInstances, instanceObj => {
            // Do these updates last
            return ClusterConfigService._updateInstancesWithConfigs(sessionUser, instanceObj)
          })
          .then(instanceObjs => instanceObjs.concat(newInstanceObjs))
      })
  }

  /**
   * Updates a Cluster Config from a webhook.  It gets all of the existing instances, removes any
   * no longer in the config, updates existing ones, and creates new ones that don't currently
   * exist
   * @param {User}     sessionUser                   - User model for the an owner with permission
   * @param {Instance} mainInstance                  - Main instance of this cluster
   * @param {ObjectId} mainInstance._id              - Instance id
   * @param {Boolean}  mainInstance.isTesting        - True if the instance is a testing instance
   * @param {Object}   githubPushInfo                - Model containing GitHub push data
   * @param {String}   githubPushInfo.repo           - Full Repository Name (owner/repo)
   * @param {String}   githubPushInfo.branch         - Current branch this instance should be on
   * @param {String}   githubPushInfo.commit         - New commit this instance should be on
   * @param {Object}   githubPushInfo.user           - Model containing the pusher's data
   * @param {Number}   githubPushInfo.user.id        - GitHub ID for the pusher
   * @param {Object[]} octobearInfo                  - Parsed data from the Docker Compose File
   * @param {String}   octobearInfo.metaData.name    - Name of the service
   * @param {Boolean}  octobearInfo.metaData.isMain  - True if the service is the main instance
   * @param {Object}   octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}   octobearInfo.instance         - Contains info on each instance
   * @param {String}   octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}   octobearInfo.instance.containerStartCommand  - Container's start command
   * @param {Number[]} octobearInfo.instance.ports  - Array of ports to open on the instance
   * @param {String[]} octobearInfo.instance.env    - Array of envs for the instance (env=a)
   * @returns {Promise}
   * @resolves {AutoIsolationConfig} - Updated autoIsolationConfig model
   */
  static updateCluster (sessionUser, mainInstance, githubPushInfo, octobearInfo) {
    const log = ClusterConfigService.log.child({
      method: 'updateCluster',
      sessionUser, mainInstance, githubPushInfo, octobearInfo
    })
    log.info('called')
    return AutoIsolationService.fetchAutoIsolationDependentInstances(mainInstance._id)
      .then(instancesInCluster => {
        // Since the main instance isn't part of the deps, we need to add it to the cluster
        // so we can update it later
        instancesInCluster.push(mainInstance)
        return ClusterConfigService._mergeConfigsIntoInstances(octobearInfo, instancesInCluster)
      })
      .then(instanceObjects => {
        return ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          sessionUser,
          instanceObjects,
          mainInstance,
          githubPushInfo
        )
      })
      .then(ClusterConfigService._createAutoIsolationModelsFromClusterInstances)
      .then(autoIsolationModel => {
        log.info({
          autoIsolationModel
        }, 'updating the autoIsolationModel')
        // updateInstances is now the list of all of the instances
        return AutoIsolationConfig.updateAutoIsolationDependencies(
          autoIsolationModel.instance,
          autoIsolationModel.requestedDependencies
        )
      })
      .then(() => {
        const deployModel = {
          instanceId: mainInstance._id.toString(),
          pushInfo: githubPushInfo
        }
        log.info(deployModel, 'autoDeploy main instance')
        return rabbitMQ.autoDeployInstance(deployModel)
      })
  }

  /**
   * @param  {Object[]}   configs
   * @param  {Instance[]} instances
   * @return {Object[]} super objects containing both the instance and the config
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
      return {
        instance,
        config: configs.find(hasKeypaths({ 'instance.name': instance.name }))
      }
    })
  }

  static _createDockerfileContent (parsedConfigData, cvOpts, parentInfaCodeVersion) {
    const dockerFileContent = parsedConfigData.files['/Dockerfile'].body
    return ContextVersion.createWithDockerFileContent(cvOpts, dockerFileContent, { parent: parentInfaCodeVersion._id, edited: true })
  }

  /**
   *
   * @param configs
   * @param mergedInstances
   * @returns {Object[]}
   * @private
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
   * @param  {Object[]} instanceObjs          - Objects containing the instance and the config
   * @param  {Instance} instanceObjs.instance
   * @param  {Object}   instanceObjs.config
   * @param  {Object}   config
   * @return {Boolean} true if config does not correspond to an instance
   */
  static _isConfigMissingInstance (instanceObjs, config) {
    return !instanceObjs.find(hasKeypaths({
      'instance.name': config.instance.name
    }))
  }

  /**
   * Given an instance containing a configuration, update the instance with the properties
   *
   * @param {User}     sessionUser                         - User model for the an owner with permission
   * @param {Object}   instanceObj                         - Model which contains an Instance and a config
   * @param {Instance} instanceObj.instance                - Model which contains an Instance and a config
   * @param {ObjectId} instanceObj.config                  - Octobear config model
   * @param {String}   instanceObj.config.instance.containerStartCommand  - Container's start command
   * @param {Number[]} instanceObj.config.instance.ports   - Array of ports to open on the instance
   * @param {String[]} instanceObj.config.instance.env     - Array of envs for the instance (env=a)
   *
   * @returns {Promise}
   * @resolves {Object}   model          - Updated Instance model with Octobear config model
   * @resolves {Instance} model.instance - Updated Instance model
   * @resolves {Instance} model.config   - Octobear config model
   * @resolves {Object} - Updated Instance model with Octobear config model
   *
   * @throws   {Boom.notFound} When any of the mongo queries fails to return a value
   * @throws   {Boom.badRequest} When the contextVersion hasn't started building, owners don't match
   * @throws   {Boom.badRequest} When `shouldNotAutofork` is passed for an instance that's not a masterpod
   * @throws   {Error} any other error
   * @private
   */
  static _updateInstancesWithConfigs (sessionUser, instanceObj) {
    return InstanceService.updateInstance(
      instanceObj.instance, {
        aliases: instanceObj.config.instance.aliases,
        env: instanceObj.config.instance.env,
        ports: instanceObj.config.instance.ports,
        containerStartCommand: instanceObj.config.instance.containerStartCommand
      },
      sessionUser
    )
      .then(instance => {
        return {
          instance,
          config: instanceObj.config
        }
      })
  }

  /**
   * Creates a new cluster instance for when a Cluster Update happens
   *
   * @param {User}     sessionUser                   - User model for the an owner with permission
   * @param {Object[]} octobearInfo                  - Parsed data from the Docker Compose File
   * @param {String}   octobearInfo.metaData.name    - Name of the service
   * @param {Boolean}  octobearInfo.metaData.isMain  - True if the service is the main instance
   * @param {String}   octobearInfo.contextVersion.buildDockerfilePath - Dockerfile path
   * @param {Object}   octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}   octobearInfo.instance         - Contains info on each instance
   * @param {String}   octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}   octobearInfo.instance.containerStartCommand     - Container's start command
   * @param {Number[]} octobearInfo.instance.ports   - Array of ports to open on the instance
   * @param {String[]} octobearInfo.instance.env     - Array of envs for the instance (env=a)
   * @param {String}   repoFullName                  - Full repo name (user/repo)
   * @param {Boolean}  isTesting                     - True if this is a Testing Cluster
   * @param {String}   triggeredAction               - Action that triggered creation
   *
   * @returns {Promise}
   * @resolves {Instance} - Updated Instance model with Octobear config model
   * @private
   */
  static _createNewInstancesForNewConfigs (sessionUser, octobearInfo, repoFullName, isTesting, testReporters, triggeredAction) {
    const isTestingInstance = octobearInfo.metadata.isMain && isTesting
    const isTestReporter = testReporters.indexOf(octobearInfo.metadata.name) >= 0
    return ClusterConfigService.createClusterInstance(
      sessionUser,
      octobearInfo,
      repoFullName,
      isTestingInstance,
      isTestReporter,
      triggeredAction
    )
      .then(instance => {
        return {
          instance,
          config: octobearInfo
        }
      })
  }

  /**
   * @param  {ObjectId} instanceId
   * @return {undefined}
   */
  static fetchConfigByInstanceId (instanceId) {
    return AutoIsolationConfig.findActiveByInstanceId(instanceId)
      .get('_id')
      .then(InputClusterConfig.findActiveByAutoIsolationId)
  }

  /**
   * Given a repo and filepath, fetch the Docker Compose file.
   *
   * @param {User}   bigPoppaUser             - The bigPoppaUser model for the owner of this repo
   * @param {String} bigPoppaUser.accessToken - The user's access token
   * @param {String} repoFullName             - Org/Repo for the repository we want to fetch from
   * @param {String} filePath                 - Path to the Docker Compose file
   *
   * @resolves {Object} model                         - processed data on the Docker Compose File
   * @resolves {String} model.fileString - the Docker Compose File's realtext data
   * @resolves {String} model.fileSha                 - sha for the Docker Compose File
   *
   */
  static fetchFileFromGithub (bigPoppaUser, repoFullName, filePath) {
    const log = ClusterConfigService.log.child({
      method: 'fetchFileFromGithub',
      bigPoppaUser, repoFullName, filePath
    })
    const token = keypather.get(bigPoppaUser, 'accessToken')
    const github = new GitHub({ token })
    return github.getRepoContentAsync(repoFullName, filePath)
      .then(fileContent => {
        log.trace({ fileContent }, 'content response')
        const base64Content = fileContent.content
        const buf = new Buffer(base64Content, 'base64')
        const fileString = buf.toString()

        log.info({ fileString }, 'content response')
        return {
          fileString,
          fileSha: fileContent.sha,
          filePath
        }
      })
  }

  /**
   * Takes composeFileData (from fetchFileFromGithub) and combines it with other data to format
   * it correctly for Octobear.parse. If any `env_file` is present, then populate the ENVs
   * for those files by fetching them from github.
   *
   * @param {Object} composeFileData            - processed data on the Docker Compose File
   * @param {String} composeFileData.fileString - the Docker Compose File's realtext data
   * @param {String} composeFileData.fileSha    - sha for the Docker Compose File
   * @param {String} repoFullName               - Full repo name (Org/repo)
   * @param {String} mainInstanceName           - Name that the main instance should have
   * @param {User}   bigPoppaUser               - The bigPoppaUser model for the owner of this repo
   *
   * @resolves {Object[]} octobearInfo                  - Parsed data from the Docker Compose File
   * @resolves {String}   octobearInfo.metaData.name    - Name of the service
   * @resolves {Boolean}  octobearInfo.metaData.isMain  - True if the service is the main instance
   * @resolves {Object}   octobearInfo.files            - Contains the dockerfile body (Optional)
   * @resolves {Object}   octobearInfo.instance         - Contains info on each instance
   * @resolves {String}   octobearInfo.instance.name    - Instance's name (different from compose file)
   * @resolves {String}   octobearInfo.instance.containerStartCommand  - Container's start command
   * @resolves {Number[]} octobearInfo.instance.ports   - Array of ports to open on the instance
   * @resolves {String[]} octobearInfo.instance.env     - Array of envs for the instance (env=a)
   */
  static parseComposeFileAndPopulateENVs (composeFileData, repoFullName, mainInstanceName, bigPoppaUser) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFileAndPopulateENVs',
      composeFileData, repoFullName, mainInstanceName
    })
    log.info('called')
    return ClusterConfigService.parseComposeFile(composeFileData, repoFullName, mainInstanceName)
      .then(parsedCompose => {
        log.trace({ parsedCompose }, 'Parsed docker compose file')
        const fileFetches = parsedCompose.envFiles.reduce((obj, fileName) => {
          obj[fileName] = ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, fileName).then(f => f.fileString)
          return obj
        }, {})
        return [parsedCompose, Promise.props(fileFetches)]
      })
      .spread((parsedCompose, fileFetches) => {
        log.trace('Fetches all files from Github')
        return octobear.populateENVsFromFiles(parsedCompose.results, fileFetches)
      })
      .then(services => {
        log.trace({ services }, 'Finished populating ENVs')
        return { results: services }
      })
  }

  /**
   * Takes composeFileData (from fetchFileFromGithub) and combines it with other data to format
   * it correctly for Octobear.parse
   *
   * @param {Object} composeFileData                         - processed data on the Docker Compose File
   * @param {String} composeFileData.fileString - the Docker Compose File's realtext data
   * @param {String} composeFileData.fileSha                 - sha for the Docker Compose File
   * @param {String} repoFullName                            - Full repo name (Org/repo)
   * @param {String} mainInstanceName                        - Name that the main instance should have
   *
   * @resolves {Object[]} octobearInfo                  - Parsed data from the Docker Compose File
   * @resolves {String}   octobearInfo.metaData.name    - Name of the service
   * @resolves {Boolean}  octobearInfo.metaData.isMain  - True if the service is the main instance
   * @resolves {Object}   octobearInfo.files            - Contains the dockerfile body (Optional)
   * @resolves {Object}   octobearInfo.instance         - Contains info on each instance
   * @resolves {String}   octobearInfo.instance.name    - Instance's name (different from compose file)
   * @resolves {String}   octobearInfo.instance.containerStartCommand  - Container's start command
   * @resolves {Number[]} octobearInfo.instance.ports   - Array of ports to open on the instance
   * @resolves {String[]} octobearInfo.instance.env     - Array of envs for the instance (env=a)
   */
  static parseComposeFile (composeFileData, repoFullName, mainInstanceName) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFile',
      composeFileData, repoFullName, mainInstanceName
    })
    log.info('called')
    const opts = {
      repositoryName: mainInstanceName,
      ownerUsername: GitHub.getOrgFromFullRepoName(repoFullName),
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      dockerComposeFileString: composeFileData.fileString,
      dockerComposeFilePath: composeFileData.filePath
    }
    log.trace({ opts }, 'opts for octobera.parse')
    return octobear.parse(opts)
  }

  /**
   * Checks if the given instance has a Docker Compose config, and if it does, cause an update.
   * If it doesn't, this throws a BaseSchema.NotFoundError
   *
   * @param {ObjectId} instanceId             - Instance Id to look up
   * @param {Object}   githubPushInfo         - Github webhook push data
   * @param {Object}   githubPushInfo.repo    - Github repositories full name (org/repo)
   * @param {Object}   githubPushInfo.user    - Github user data
   * @param {Object}   githubPushInfo.user.id - Github user id
   *
   * @resolves {undefined} resolves when the update config job has been created
   *
   * @throws InputClusterConfig.NotChangedError - When the config's sha's match, so this won't be done
   * @throws InputClusterConfig.NotFoundError - When no config is found to match the given instance
   */
  static checkIfComposeFileHasChanged (instanceId, githubPushInfo) {
    return ClusterConfigService.fetchConfigByInstanceId(instanceId)
      .then(clusterConfig => {
        // We found a cluster, so fetch the current one, and see if it changed
        return UserService.getByGithubId(githubPushInfo.user.id)
          .then(bpUser => {
            return ClusterConfigService.fetchFileFromGithub(
              bpUser,
              githubPushInfo.repo,
              clusterConfig.filePath
            )
          })
          .then(newComposeFileData => {
            if (newComposeFileData.fileSha === clusterConfig.fileSha) {
              throw new InputClusterConfig.NotChangedError({
                fileSha: newComposeFileData.fileSha
              })
            }
            // files are different, we need to update!
          })
      })
  }
}
