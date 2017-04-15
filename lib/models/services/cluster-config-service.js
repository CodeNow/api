'use strict'
require('loadenv')('models/services/cluster-config-service')

const path = require('path')
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
const messenger = require('socket/messenger')
const rabbitMQ = require('models/rabbitmq')
const UserService = require('models/services/user-service')

module.exports = class ClusterConfigService {
  static get log () {
    return logger.child({
      module: 'ClusterConfigService'
    })
  }

  static updateBuildContextForEachService (composeFilePath, services) {
    const log = ClusterConfigService.log.child({
      method: 'updateBuildContextForEachService',
      composeFilePath,
      services
    })
    const composeFileDirname = path.dirname(composeFilePath)
    log.info('called')
    services.forEach((service) => {
      if (service.build && service.build.dockerBuildContext) {
        let newContext = path.resolve(composeFileDirname, service.build.dockerBuildContext)
        log.info({
          newContext,
          composeFileDirname,
          oldContext: service.build.dockerBuildContext
        }, 'new context')
        if (newContext.indexOf('/') === 0) {
          newContext = '.'.concat(newContext)
        }
        log.info({
          newContext,
          composeFileDirname,
          oldContext: service.build.dockerBuildContext
        }, 'new context2')
        service.build.dockerBuildContext = newContext
      }
    })
  }

  /**
   * Create Docker Compose Cluster
   * - fetch compose file content from github
   * - parse compose content
   * - call createFromRunnableConfig
   * @param {User}     sessionUser          - session user full object
   * @param {Object}   data                 - cluster data
   * @param {String}   data.triggeredAction - action that triggered creation
   * @param {String}   data.repoFullName    - full repo name E.x. Runnable/api
   * @param {String}   data.branchName      - branch name
   * @param {String}   data.filePath        - path to the cluster config file
   * @param {Boolean}  data.isTesting       - is this testing cluster
   * @param {String[]} data.testReporters   - array of names of the testReporters
   * @param {String}   data.clusterName     - name of the cluster
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
    const clusterName = data.clusterName
    return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, filePath)
      .then(parseInput => {
        return ClusterConfigService.parseComposeFileAndPopulateENVs(parseInput, repoFullName, clusterName, sessionUser.bigPoppaUser, filePath)
          .then(parsedCompose => {
            log.trace({ parsedCompose }, 'parsed compose')
            const clusterOpts = {
              clusterName: data.clusterName,
              filePath: data.filePath,
              fileSha: parseInput.fileSha,
              isTesting: data.isTesting,
              testReporters: data.testReporters,
              parentInputClusterConfigId: data.parentInputClusterConfigId
            }
            return ClusterConfigService.createFromRunnableConfig(
              sessionUser,
              parsedCompose,
              data.triggeredAction,
              repoFullName,
              clusterOpts
            )
          })
      })
  }

  /**
   * Create Cluster from parsed runnable config
   * - create new instance for each defined in the config
   * - create AutoIsolationConfig and emit `auto-isolation-config.created`
   * - create InputClusterConfig model with a link to AutoIsolationConfig
   * @param {SessionUser} sessionUser                              - session user full object
   * @param {Object}      runnableConfig                           - parsed runnable config
   * @param {String}      triggeredAction                          - action that triggered creation
   * @param {String}      repoFullName                             - full repo name E.x. Runnable/api
   * @param {Object}      clusterOpts                              - parsed data from the compose file
   * @param {String}      clusterOpts.filePath                     - path to the cluster config file
   * @param {String}      clusterOpts.fileSha                      - md5 hash of the file
   * @param {String}      clusterOpts.clusterName                  - name for the cluster
   * @param {Boolean}     clusterOpts.isTesting                    - isTesting cluster
   * @param {String[]=}   clusterOpts.testReporters                - array of test reporters
   * @param {ObjectId=}   clusterOpts.parentInputClusterConfigId   - the parent ICC of the cluster
   * @return {Promise}    with object that has AutoIsolationConfig
   */
  static createFromRunnableConfig (sessionUser, runnableConfig, triggeredAction, repoFullName, clusterOpts) {
    const log = ClusterConfigService.log.child({
      method: 'create',
      sessionUser,
      triggeredAction,
      runnableConfig,
      repoFullName,
      clusterOpts
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
        clusterOpts,
        triggeredAction
      ))
      .then(ClusterConfigService._createAutoIsolationModelsFromClusterInstances)
      .then(autoIsolationOpts => {
        autoIsolationOpts.createdByUser = sessionUserBigPoppaId
        autoIsolationOpts.ownedByOrg = organization.id
        autoIsolationOpts.redeployOnKilled = clusterOpts.isTesting
        return AutoIsolationService.createOrUpdateAndEmit(autoIsolationOpts)
          .then((autoIsolationConfig) => {
            return InputClusterConfig.createAsync({
              autoIsolationConfigId: autoIsolationConfig._id,
              filePath: clusterOpts.filePath,
              fileSha: clusterOpts.fileSha,
              createdByUser: sessionUserBigPoppaId,
              ownedByOrg: organization.id,
              clusterName: clusterOpts.clusterName,
              isTesting: clusterOpts.isTesting,
              parentInputClusterConfigId: clusterOpts.parentInputClusterConfigId || null
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
   *                                                               should match the branch
   * @param {Instance=} mainInstance                               - Main instance model of the config
   *                                                               if null, finds isMain
   *
   * @returns {Object}   model
   *          {ObjectId} model.instance                          - instanceId of the main instance
   *          {Object[]} model.requestedDependencies             - Array of models with instanceIds
   *                                                             of deps to copy
   *          {ObjectId} model.requestedDependencies.instance    - Id of the instance to match
   *          {Boolean}  model.requestedDependencies.matchBranch - True if the copies should match
   *                                                             the branch of the master
   * @private
   */
  static _createAutoIsolationModelsFromClusterInstances (instancesWithConfigs, mainInstance) {
    const log = ClusterConfigService.log.child({
      method: '_createAutoIsolationModelsFromClusterInstances',
      instancesWithConfigs
    })
    log.info('called')
    if (!mainInstance) {
      const mainInstanceObj = instancesWithConfigs.find(instanceObj => {
        return instanceObj.config.metadata.isMain
      })
      mainInstance = mainInstanceObj.instance
    }
    const requestedDependencies = instancesWithConfigs.filter(instanceObj => {
      return instanceObj.instance._id.toString() !== mainInstance._id.toString()
    })
      .map(instanceObj => {
        return { instance: instanceObj.instance._id }
      })

    const model = {
      instance: mainInstance._id,
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
   * @param {String}      parsedInstanceData.metaData.name       - Name of the service
   * @param {Boolean}     parsedInstanceData.metaData.isMain     - True if the service is the main instance
   * @param {ObjectId}    parsedInstanceData.contextId
   * @param {String}      parsedInstanceData.build.dockerFilePath
   * @param {String}      parsedInstanceData.instance.name
   * @param {String[]}    parsedInstanceData.instance.env
   * @param {String}      parsedInstanceData.instance.containerStartCommand
   * @param {String}      repoFullName (org/repo)
   * @param {Boolean}     isTesting
   * @param {Boolean}     isTestReporter
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
        return ClusterConfigService._createInstance(sessionUser, parsedInstanceData, buildId, isTesting, isTestReporter)
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
   * @param {String}      parsedConfigData.build.dockerFilePath
   * @param {String}      parsedConfigData.code.repo        - Repo name
   * @param {String}      parsedConfigData.code.commitish   - Can be commit or branch.
   * But commit will be ignored, since for app code version we need both commit and branch and we can't
   * find branch name using commit in git. Optional parameter.
   * If not specifieed default branch would be used for app code version creation
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
        const instanceRepoName = keypather.get(parsedConfigData, 'code.repo') || repoName
        const instanceCommitish = keypather.get(parsedConfigData, 'code.commitish')
        log.trace({
          instanceRepoName,
          instanceCommitish
        }, 'service repo name')
        return ContextVersion.createAppcodeVersion(sessionUser, instanceRepoName, instanceCommitish)
        .then((appCodeVersion) => {
          log.info({ appCodeVersion }, 'appCodeVersion created')
          cvOpts.appCodeVersions = [ appCodeVersion ]
          if (keypather.get(parsedConfigData, 'files[\'/Dockerfile\']')) {
            return ClusterConfigService._createDockerfileContent(parsedConfigData, cvOpts, parentInfaCodeVersion)
          }
          const buildDockerfilePath = keypather.get(parsedConfigData, 'build.dockerFilePath')
          if (buildDockerfilePath) {
            cvOpts.buildDockerfilePath = buildDockerfilePath
          }
          // TODO: change context if compose file not in the root
          const dockerBuildContext = keypather.get(parsedConfigData, 'build.dockerBuildContext')
          if (dockerBuildContext) {
            cvOpts.buildDockerContext = dockerBuildContext
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
   * @param  {SessionUser}   sessionUser
   * @param  {Object}        parsedInstanceData
   * @param  {String}        parsedInstanceData.build.dockerFilePath - signifies this is a repo instance
   * @param  {Object}        parsedInstanceData.instance
   * @param  {String}        parsedInstanceData.instance.name
   * @param  {Array<String>} parsedInstanceData.instance.env
   * @param  {String}        parsedInstanceData.instance.containerStartCommand
   * @param  {ObjectId}      parentBuildId
   * @param  {Boolean}       isTesting
   * @param  {Boolean}       isTestReporter
   * @return {Promise}
   * @resolves {Instance} newly created parent instanceId
   */
  static _createInstance (sessionUser, parsedInstanceData, parentBuildId, isTesting, isTestReporter) {
    const configData = parsedInstanceData.instance
    const inputInstanceOpts = pick(configData, ['aliases', 'env', 'containerStartCommand', 'name', 'ports'])
    const defaultInstanceOpts = {
      build: parentBuildId,
      masterPod: true,
      ipWhitelist: {
        enabled: false
      },
      shouldNotAutofork: !keypather.get(parsedInstanceData, 'build.dockerFilePath'),
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
   * @param {Object}      clusterOpts                            - parsed data from the compose file
   * @param {String}      clusterOpts.filePath                   - path to the cluster config file
   * @param {String}      clusterOpts.fileSha                    - md5 hash of the file
   * @param {String}      clusterOpts.clusterName                - name for the cluster
   * @param {Boolean}     clusterOpts.isTesting                  - isTesting cluster
   * @param {String}      clusterOpts.parentInputClusterConfigId - the parent ICC of the cluster
   *
   * @returns {Promise}
   * @resolves {Instance[]} Instances which represent the requested dependencies for this isolation
   * @private
   */
  static _createUpdateAndDeleteInstancesForClusterUpdate (sessionUser, instanceObjs, mainInstance, githubPushInfo, clusterOpts) {
    const log = ClusterConfigService.log.child({
      method: '_createUpdateAndDeleteInstancesForClusterUpdate',
      sessionUser, instanceObjs, mainInstance, githubPushInfo
    })
    log.info('called')
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, githubPushInfo.repo)
    const orgInfo = {
      githubOrgId: bigPoppaOwnerObject.githubId,
      bigPoppaOrgId: bigPoppaOwnerObject.id
    }
    // No instance means create a new one
    // We need to create new instances first, so when we update them, the connections can be made
    // Since we need to connect aliases by ContextId, we make the instances later
    // Here, we just create the context
    const createConfigs = instanceObjs.filter(instanceObj => instanceObj.config && !instanceObj.instance)
    // if the instance and config exist, then we know we need to update
    const updateConfigs = instanceObjs.filter(instanceObj => instanceObj.config && instanceObj.instance)
    // With no config, we delete the instanceObj
    const deleteConfigs = instanceObjs.filter(instanceObj => !instanceObj.config && instanceObj.instance)

    const createContextPromises = Promise
      .map(createConfigs, instanceObj =>
        ClusterConfigService.createClusterContext(sessionUser, instanceObj.config, orgInfo)
      )

    const deleteInstancePromises = Promise
      .map(deleteConfigs, instanceObj =>
        rabbitMQ.deleteInstance({instanceId: keypather.get(instanceObj, 'instance._id.toString()')})
      )

    return Promise
      .props({
        createContextPromises,
        deleteInstancePromises
      })
      .get('createContextPromises') // Make sure creates happen before updating
      .tap(contextIdFilledConfigs => {
        // Now we need to put all of the matching contextIds in all of the configs
        // So first combine them
        const allConfigs = contextIdFilledConfigs.concat(updateConfigs.map(model => model.config))
        // Then map the aliases to the context ids.  This should give us a list of all configs
        // (new and existing) that we can match up to each other.
        ClusterConfigService.addAliasesToContexts(allConfigs)
      })
      .map(instanceDef => ClusterConfigService._createNewInstancesForNewConfigs(
        sessionUser,
        instanceDef,
        githubPushInfo.repo,
        clusterOpts,
        'autoDeploy'
      ))
      .then(newInstanceObjs => {
        return Promise
          .map(updateConfigs, instanceObj => {
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
   * @param {User}      sessionUser                   - User model for the an owner with permission
   * @param {Instance}  mainInstance                  - Main instance of this cluster
   * @param {ObjectId}  mainInstance._id              - Instance id
   * @param {Boolean}   mainInstance.isTesting        - True if the instance is a testing instance
   * @param {Object}    githubPushInfo                - Model containing GitHub push data
   * @param {String}    githubPushInfo.repo           - Full Repository Name (owner/repo)
   * @param {String}    githubPushInfo.branch         - Current branch this instance should be on
   * @param {String}    githubPushInfo.commit         - New commit this instance should be on
   * @param {Object}    githubPushInfo.user           - Model containing the pusher's data
   * @param {Number}    githubPushInfo.user.id        - GitHub ID for the pusher
   * @param {Object[]}  octobearInfo                  - Parsed data from the Docker Compose File
   * @param {String}    octobearInfo.metaData.name    - Name of the service
   * @param {Boolean}   octobearInfo.metaData.isMain  - True if the service is the main instance
   * @param {Object}    octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}    octobearInfo.instance         - Contains info on each instance
   * @param {String}    octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}    octobearInfo.instance.containerStartCommand  - Container's start command
   * @param {Number[]}  octobearInfo.instance.ports  - Array of ports to open on the instance
   * @param {String[]}  octobearInfo.instance.env    - Array of envs for the instance (env=a)
   * @param {Object}    clusterOpts                            - parsed data from the compose file
   * @param {String}    clusterOpts.filePath                   - path to the cluster config file
   * @param {String}    clusterOpts.fileSha                    - md5 hash of the file
   * @param {String}    clusterOpts.clusterName                - name for the cluster
   * @param {Boolean}   clusterOpts.isTesting                  - isTesting cluster
   * @param {ObjectId=} clusterOpts.parentInputClusterConfigId - the parent ICC of the cluster
   * @returns {Promise}
   * @resolves {AutoIsolationConfig} - Updated autoIsolationConfig model
   */
  static updateCluster (sessionUser, mainInstance, githubPushInfo, octobearInfo, clusterOpts) {
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
          githubPushInfo,
          clusterOpts
        )
      })
      .then(instanceObjects =>
        ClusterConfigService._createAutoIsolationModelsFromClusterInstances(
          instanceObjects,
          mainInstance
      ))
      .then(autoIsolationModel => {
        log.info({
          autoIsolationModel
        }, 'updating the autoIsolationModel')
        // updateInstances is now the list of all of the instances
        return AutoIsolationService.createOrUpdateAndEmit(autoIsolationModel)
      })
      .then(autoIsolationConfig => InputClusterConfig.updateConfig(autoIsolationConfig, clusterOpts))
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
   * Creates super objects containing matching instances and configs.  This also adds the contextId
   * to the config
   *
   * @param {Object[]}   configs
   * @param {Instance[]} instances
   * @returns {Object[]} super objects containing both the instance and the config
   */
  static _addConfigToInstances (configs, instances) {
    return instances.reduce((instanceConfigObjs, instance) => {
      const config = configs.find(hasKeypaths({ 'instance.name': instance.name }))
      if (config) {
        config.contextId = keypather.get(instance, 'contextVersion.context')
        let commitish = keypather.get(config, 'code.commitish')
        let branch = instance.getMainBranchName()
        // check if the compose 'commitish'  is equal to the instance branch to delete
        //  the instance and rebuild during _createUpdateAndDeleteInstancesForClusterUpdate
        if (commitish && branch !== commitish.toLowerCase()) {
          instanceConfigObjs.push({ config, instance: null })
          instanceConfigObjs.push({ instance, config: null })
          return instanceConfigObjs
        }
      }
      instanceConfigObjs.push({
        instance,
        config
      })
      return instanceConfigObjs
    }, [])
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
   * @param {User}      sessionUser                   - User model for the an owner with permission
   * @param {Object[]}  octobearInfo                  - Parsed data from the Docker Compose File
   * @param {String}    octobearInfo.metaData.name    - Name of the service
   * @param {Boolean}   octobearInfo.metaData.isMain  - True if the service is the main instance
   * @param {Object}    octobearInfo.code             - Optional code configuration
   * @param {String}    octobearInfo.code.repo        - Repo name
   * @param {String}    octobearInfo.code.commitish   - Commit or branch. Optional
   * @param {String}    octobearInfo.build.dockerFilePath - Dockerfile path
   * * @param {String}  octobearInfo.build.dockerBuildContext - Dockerfile build context
   * @param {Object}    octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}    octobearInfo.instance         - Contains info on each instance
   * @param {String}    octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}    octobearInfo.instance.containerStartCommand     - Container's start command
   * @param {Number[]}  octobearInfo.instance.ports   - Array of ports to open on the instance
   * @param {String[]}  octobearInfo.instance.env     - Array of envs for the instance (env=a)
   * @param {String}    repoFullName                  - Full repo name (user/repo)
   * @param {Object}    clusterOpts                   - Cluster Config model
   * @param {Boolean}   clusterOpts.isTesting         - True if this is a Testing Cluster
   * @param {String[]=} clusterOpts.testReporters     - The test reporters of the cluster
   * @param {String}    triggeredAction               - Action that triggered creation
   *
   * @returns {Promise}
   * @resolves {Instance} - Updated Instance model with Octobear config model
   * @private
   */
  static _createNewInstancesForNewConfigs (sessionUser, octobearInfo, repoFullName, clusterOpts, triggeredAction) {
    const isTestReporter = clusterOpts.testReporters ? clusterOpts.testReporters.indexOf(octobearInfo.metadata.name) >= 0 : false
    return ClusterConfigService.createClusterInstance(
      sessionUser,
      octobearInfo,
      repoFullName,
      clusterOpts.isTesting,
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
   * @param {User}    bigPoppaUser             - The bigPoppaUser model for the owner of this repo
   * @param {String}  bigPoppaUser.accessToken - The user's access token
   * @param {String}  repoFullName             - Org/Repo for the repository we want to fetch from
   * @param {String}  filePath                 - Path to the Docker Compose file
   * @param {String=} commitRef                - Name of the commit/branch/tag (leave blank for default)
   *
   * @resolves {Object}  model                 - processed data on the Docker Compose File
   * @resolves {String}  model.fileString      - the Docker Compose File's realtext data
   * @resolves {String}  model.fileSha         - sha for the Docker Compose File
   * @resolves {String=} model.commitRef       - Name of commit/branch/tag this file is in
   *
   */
  static fetchFileFromGithub (bigPoppaUser, repoFullName, filePath, commitRef) {
    const log = ClusterConfigService.log.child({
      method: 'fetchFileFromGithub',
      bigPoppaUser, repoFullName, filePath
    })
    const token = keypather.get(bigPoppaUser, 'accessToken')
    const github = new GitHub({ token })
    return github.getRepoContent(repoFullName, filePath, commitRef)
      .then(fileContent => {
        log.trace({ fileContent }, 'content response')
        const base64Content = fileContent.content
        const buf = new Buffer(base64Content, 'base64')
        const fileString = buf.toString()

        log.info({ fileString }, 'content response')
        return {
          fileString,
          fileSha: fileContent.sha,
          filePath,
          commitRef
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
   * @param {String} composeFileData.commitRef  - The name of the commit/branch/tag this is from
   * @param {String} repoFullName               - Full repo name (Org/repo)
   * @param {String} clusterName                - Name that the cluster
   * @param {User}   bigPoppaUser               - The bigPoppaUser model for the owner of this repo
   * @param {String} filePath                   - Original file path to the compose file
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
  static parseComposeFileAndPopulateENVs (composeFileData, repoFullName, clusterName, bigPoppaUser, filePath) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFileAndPopulateENVs',
      composeFileData, repoFullName, clusterName, filePath
    })
    log.info('called')
    const commitRef = composeFileData.commitRef
    return ClusterConfigService.parseComposeFile(composeFileData, repoFullName, clusterName)
      .then(parsedCompose => {
        log.trace({ parsedCompose }, 'Parsed docker compose file')
        const fileFetches = parsedCompose.envFiles.reduce((obj, fileName) => {
          obj[fileName] = ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, fileName, commitRef).then(f => f.fileString)
          return obj
        }, {})
        return [parsedCompose, Promise.props(fileFetches)]
      })
      .spread((parsedCompose, fileFetches) => {
        log.trace('Fetches all files from Github')
        return octobear.populateENVsFromFiles(parsedCompose.results, fileFetches)
      })
      .tap(services => {
        return ClusterConfigService.updateBuildContextForEachService(filePath, services)
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
   * @param {String} clusterName                        - Name that the cluster
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
  static parseComposeFile (composeFileData, repoFullName, clusterName) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFile',
      composeFileData, repoFullName, clusterName
    })
    log.info('called')
    const opts = {
      repositoryName: clusterName,
      ownerUsername: GitHub.getOrgFromFullRepoName(repoFullName),
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      dockerComposeFileString: composeFileData.fileString,
      dockerComposeFilePath: composeFileData.filePath,
      scmDomain: process.env.GITHUB_HOST
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
   * @param {Object}   githubPushInfo.commit  - Commit for this push
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
              clusterConfig.filePath,
              githubPushInfo.commit
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

  /**
   * Sends a socket message to the front end with cluster build updates
   *
   * @param {Number}   githubId             - Used to send the message to the right connections
   * @param {Object}   jobInfo              - Sent to the front end for use in cluster creation/error reporting
   */
  static sendClusterSocketUpdate (githubId, jobInfo) {
    return messenger.messageRoom('org', githubId, jobInfo)
  }
}
