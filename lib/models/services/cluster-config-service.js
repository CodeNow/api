'use strict'
require('loadenv')('models/services/cluster-config-service')

const difference = require('lodash.difference')
const path = require('path')
const keypather = require('keypather')()
const octobear = require('@runnable/octobear')
const Promise = require('bluebird')
const uuid = require('uuid')
const pick = require('101/pick')
const pluck = require('101/pluck')

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
const IsolationService = require('models/services/isolation-service')
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

  /**
   * Update build context with the location of compose file directory
   * @param {String} composeFilePath - relative path to the compose file
   * @param {Array|Service} services - array of services
   */
  static updateBuildContextForEachService (composeFilePath, services) {
    const log = ClusterConfigService.log.child({
      method: 'updateBuildContextForEachService',
      composeFilePath,
      services
    })
    const composePath = path.isAbsolute(composeFilePath) ? composeFilePath : path.resolve('/', composeFilePath)
    const composeFileDirname = path.dirname(composePath)
    log.info('called')
    services.forEach((service) => {
      if (service.build && service.build.dockerBuildContext) {
        let newDockerBuildContext = path.resolve(composeFileDirname,
          service.build.dockerBuildContext)
        // since we just constructred a new path again manually we want to make sure
        // it's relative and not absolute, that is why we prepending path
        // with a `.` if needed.
        if (path.isAbsolute(newDockerBuildContext)) {
          newDockerBuildContext = '.'.concat(newDockerBuildContext)
        }
        log.info({
          newDockerBuildContext,
          composeFileDirname,
          oldContext: service.build.dockerBuildContext
        }, 'new dockerBuildContext')
        service.build.dockerBuildContext = newDockerBuildContext
      }
    })
    return services
  }

  /**
   * Creates a model that contains the user ids and the org's ids
   * @param sessionUser
   * @param repoFullName
   * @returns {Object} model - containing owner info
   *          {Number} model.bigPoppaOrgId  - Owning org's bigPoppa id
   *          {Number} model.bigPoppaUserId - User's bigPoppa id
   *          {Number} model.githubOrgId    - Owning org's github id
   *          {Number} model.githubUserId   - User's github id
   * @private
   */
  static _getOwnerInfo (sessionUser, repoFullName) {
    const bigPoppaOwnerObject = UserService.getBpOrgInfoFromRepoName(sessionUser, repoFullName)
    return {
      bigPoppaOrgId: bigPoppaOwnerObject.id,
      bigPoppaUserId: keypather.get(sessionUser, 'bigPoppaUser.id'),
      githubOrgId: bigPoppaOwnerObject.githubId,
      githubUserId: keypather.get(sessionUser, 'accounts.github.id')
    }
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
            const files = [
              {
                path: filePath,
                sha: parseInput.sha
              }
            ]
            const clusterOpts = {
              clusterName: data.clusterName,
              files,
              isTesting: data.isTesting,
              testReporters: data.testReporters,
              parentInputClusterConfigId: data.parentInputClusterConfigId
            }
            const buildOpts = {
              repoFullName,
              triggeredAction: data.triggeredAction
            }
            return ClusterConfigService.createFromRunnableConfig(
              sessionUser,
              parsedCompose,
              buildOpts,
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
   * @param {Object}      buildOpts                                - build opts
   * @param {String}      buildOpts.triggeredAction                - action that triggered creation
   * @param {String}      buildOpts.repoFullName                   - full repo name E.x. Runnable/api
   * @param {Object}      clusterOpts                              - parsed data from the compose file
   * @param {String}      clusterOpts.filePath                     - path to the cluster config file
   * @param {String}      clusterOpts.fileSha                      - md5 hash of the file
   * @param {String}      clusterOpts.clusterName                  - name for the cluster
   * @param {Boolean}     clusterOpts.isTesting                    - isTesting cluster
   * @param {String[]=}   clusterOpts.testReporters                - array of test reporters
   * @param {ObjectId=}   clusterOpts.parentInputClusterConfigId   - the parent ICC of the cluster
   * @return {Promise}    with object that has AutoIsolationConfig
   */
  static createFromRunnableConfig (sessionUser, runnableConfig, buildOpts, clusterOpts) {
    const log = ClusterConfigService.log.child({
      method: 'createFromRunnableConfig',
      sessionUser,
      buildOpts,
      runnableConfig,
      clusterOpts
    })
    log.info('called')
    const parsedInstancesDef = runnableConfig.results
    const ownerInfo = ClusterConfigService._getOwnerInfo(sessionUser, buildOpts.repoFullName)
    return Promise
      .each(parsedInstancesDef, instanceDef => ClusterConfigService.createClusterContext(
        sessionUser,
        instanceDef,
        ownerInfo
      ))
      .tap(ClusterConfigService.addAliasesToContexts)
      .map(instanceDef => ClusterConfigService._createNewInstanceForNewConfig(
        sessionUser,
        instanceDef,
        clusterOpts,
        buildOpts,
        ownerInfo
      ))
      .then(instancesWithConfigs => ClusterConfigService.createOrUpdateIsolationConfig(
        ownerInfo,
        instancesWithConfigs,
        clusterOpts
      ))
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
   * @param {ObjectId=}   parsedInstanceData.contextId      - This is filled in here
   * @param {String}      parsedInstanceData.instance.name
   * @param {Object}      ownerInfo
   * @param {Number}      ownerInfo.githubOrgId
   * @param {Number}      ownerInfo.bigPoppaOrgId
   *
   * @resolves {parsedInstanceData} Original data given, but with the contextId attached
   */
  static createClusterContext (sessionUser, parsedInstanceData, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: 'createClusterContext',
      sessionUser
    })
    log.info('called')

    return ClusterConfigService._createContext(sessionUser, ownerInfo)
      .then(context => {
        parsedInstanceData.contextId = context._id
      })
      .return(parsedInstanceData)
  }

  /**
   * CONTEXT MUST BE CREATED BEFORE USING THIS.  The contextId must be in the config!
   * @param {SessionUser}   sessionUser
   * @param {Object}        parsedInstanceData
   * @param {String}        parsedInstanceData.metaData.name       - Name of the service
   * @param {Boolean}       parsedInstanceData.metaData.isMain     - True if the service is the main instance
   * @param {ObjectId}      parsedInstanceData.contextId
   * @param {String}      parsedInstanceData.build.dockerFilePath
   * @param {String=}     parsedInstanceData.build.dockerBuildContext
   * @param {Object}        parsedInstanceData.files
   * @param {String}        parsedInstanceData.instance.name
   * @param {String[]}      parsedInstanceData.instance.env
   * @param {String}        parsedInstanceData.instance.containerStartCommand
   * @param {String}        parsedInstanceData.code.repo        - Repo name
   * @param {String}        parsedInstanceData.code.commitish   - Can be commit or branch.
   * @param {Object}        testingOpts
   * @param {Boolean}       testingOpts.isTesting
   * @param {Boolean}       testingOpts.isTestReporter
   * @param {Object}        buildOpts                     - Building options
   * @param {String}        buildOpts.masterShorthash     - ShortHash of the master of the isolation
   * @param {String}        buildOpts.branch              - Branch of the main isolation instance
   * @param {ObjectId=}     buildOpts.isolated            - Isolation ObjectId of the cluster
   * @param {String}        buildOpts.repoFullName        - Full repo name (user/repo)
   * @param {Object|String} buildOpts.triggeredAction     - Action that triggered creation
   * @param {Object}        ownerInfo                     - Model containing owner info
   * @param {Number}        ownerInfo.bigPoppaOrgId       - Owning org's bigPoppa id
   * @param {Number}        ownerInfo.bigPoppaUserId      - User's bigPoppa id
   * @param {Number}        ownerInfo.githubOrgId         - Owning org's github id
   * @param {Number}        ownerInfo.githubUserId        - User's github id
   * @resolves {Instance}
   */
  static createClusterInstance (sessionUser, parsedInstanceData, testingOpts, buildOpts, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: 'createClusterInstance',
      sessionUser, parsedInstanceData, buildOpts, testingOpts
    })
    log.info('called')
    return Promise.try(() => {
      if (!parsedInstanceData.contextId) {
        log.error('Create Cluster attempted to create an instance without a context!', { parsedInstanceData })
        throw new Instance.CreateFailedError('Create Cluster failed because it was missing a contextId', { parsedInstanceData })
      }
    })
      .then(() => ClusterConfigService._createCVAndBuildBuild(
        sessionUser,
        ownerInfo,
        buildOpts,
        parsedInstanceData
      ))
      .then((build) => {
        log.trace({ build }, 'build created')
        const buildId = keypather.get(build, '_id.toString()')
        log.trace({ buildId }, 'build created')
        return ClusterConfigService._createInstance(
          sessionUser,
          parsedInstanceData,
          buildId,
          testingOpts,
          buildOpts
        )
      })
      .catch(err => {
        log.error({ err }, 'Failed to create instance')
        throw err
      })
  }

  /**
   * Build a new context version and trigger a build
   * @param {SessionUser} sessionUser
   * @param {Object}      ownerInfo                  - Model containing owner info
   * @param {Number}      ownerInfo.bigPoppaOrgId    - Owning org's bigPoppa id
   * @param {Number}      ownerInfo.bigPoppaUserId   - User's bigPoppa id
   * @param {Number}      ownerInfo.githubOrgId      - Owning org's github id
   * @param {Number}      ownerInfo.githubUserId     - User's github id
   * @param {Object}        parsedInstanceData
   * @param {String}        parsedInstanceData.contextId           - ContextId of this cv
   * @param {String}        parsedInstanceData.metaData.name       - Name of the service
   * @param {Boolean}       parsedInstanceData.metaData.isMain     - True if the service is the main instance
   * @param {ObjectId}      parsedInstanceData.contextId
   * @param {String}      parsedConfigData.build.dockerFilePath
   * @param {String=}     parsedConfigData.build.dockerBuildContext
   * @param {Object}        parsedInstanceData.files
   * @param {String}        parsedInstanceData.instance.name
   * @param {String[]}      parsedInstanceData.instance.env
   * @param {String}        parsedInstanceData.instance.containerStartCommand
   * @param {String}        parsedInstanceData.code.repo        - Repo name
   * @param {String}        parsedInstanceData.code.commitish   - Can be commit or branch.
   * @param {Object}        buildOpts                     - Building options
   * @param {String}        buildOpts.masterShorthash     - ShortHash of the master of the isolation
   * @param {String}        buildOpts.branch              - Branch of the main isolation instance
   * @param {ObjectId=}     buildOpts.isolated            - Isolation ObjectId of the cluster
   * @param {String}        buildOpts.repoFullName        - Full repo name (user/repo)
   * @param {Object}        buildOpts.triggeredAction     - Action that triggered creation
   *
   * @resolves {Build}    Building build with new CV
   * @private
   */
  static _createCVAndBuildBuild (sessionUser, ownerInfo, buildOpts, parsedInstanceData) {
    const log = ClusterConfigService.log.child({
      method: '_createCVAndBuildBuild',
      sessionUser, ownerInfo, buildOpts, parsedInstanceData
    })
    log.info('called')
    return ClusterConfigService._createContextVersion(
      sessionUser,
      ownerInfo,
      buildOpts,
      parsedInstanceData
    )
      .then(contextVersion => {
        log.trace({ contextVersion }, 'cv created')
        return ClusterConfigService._createBuild(sessionUser, contextVersion._id, ownerInfo)
      })
      .then(ClusterConfigService._buildBuild(sessionUser))
  }

  /**
   *
   */
  static _buildBuild (sessionUser) {
    const log = ClusterConfigService.log.child({
      method: '_buildBuild',
      sessionUser
    })
    log.info('called')
    return build => {
      const buildData = {
        message: 'Initial Cluster Creation',
        triggeredAction: {
          manual: true
        }
      }
      return BuildService.buildBuild(build._id, buildData, sessionUser)
    }
  }
  /**
   * @param  {SessionUser} sessionUser
   * @param  {Object}      orgInfo
   * @param  {Number}      orgInfo.githubOrgId
   * @param  {Number}      orgInfo.bigPoppaOrgId
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
   * @param {Object}      ownerInfo                       - Model containing owner info
   * @param {Number}      ownerInfo.bigPoppaOrgId         - Owning org's bigPoppa id
   * @param {Number}      ownerInfo.bigPoppaUserId        - User's bigPoppa id
   * @param {Number}      ownerInfo.githubOrgId           - Owning org's github id
   * @param {Number}      ownerInfo.githubUserId          - User's github id
   * @param {Object}      buildOpts                       - Building options
   * @param {String}      buildOpts.repoFullName          - Full repo name (user/repo)
   * @param {Object}      parsedConfigData                - Octobear config info
   * @param {ObjectId}    parsedConfigData.contextId      - contextId to version off of
   * @param {Object=}     parsedConfigData.files
   * @param {String}      parsedConfigData.build.dockerFilePath
   * @param {String=}     parsedConfigData.build.dockerBuildContext
   * @param {String=}     parsedConfigData.code.repo      - Repo name
   * @param {String=}     parsedConfigData.code.commitish - Can be commit or branch.
   * But commit will be ignored, since for app code version we need both commit and branch and we can't
   * find branch name using commit in git. Optional parameter.
   * If not specifieed default branch would be used for app code version creation
   * @return {ContextVersion}
   */
  static _createContextVersion (sessionUser, ownerInfo, buildOpts, parsedConfigData) {
    const log = ClusterConfigService.log.child({
      method: '_createContextVersion',
      sessionUser, ownerInfo, buildOpts, parsedConfigData
    })
    log.info('called')
    return InfraCodeVersionService.findBlankInfraCodeVersion()
      .then((parentInfaCodeVersion) => {
        log.trace({ infraCodeVersion: parentInfaCodeVersion }, 'found parent infracode version')
        const cvOpts = {
          context: parsedConfigData.contextId,
          createdBy: {
            github: ownerInfo.githubUserId,
            bigPoppa: ownerInfo.bigPoppaUserId
          },
          owner: {
            github: ownerInfo.githubOrgId,
            bigPoppa: ownerInfo.bigPoppaOrgId
          },
          advanced: true
        }
        log.trace({ cvOpts }, 'new cv opts')
        if (!keypather.get(parsedConfigData, 'metadata.isMain') && keypather.get(parsedConfigData, 'files[\'/Dockerfile\']')) {
          return ClusterConfigService._createDockerfileContent(parsedConfigData, cvOpts, parentInfaCodeVersion)
        }
        const instanceRepoName = keypather.get(parsedConfigData, 'code.repo') || buildOpts.repoFullName
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
   * @param {User}   sessionUser
   * @param {String} contextVersionId
   * @param {Object} ownerInfo                  - Model containing owner info
   * @param {Number} ownerInfo.githubOrgId      - Owning org's github id
   * @param {Number} ownerInfo.githubUserId     - User's github id
   * @return  {Promise}
   * @resolve {Build}
   */
  static _createBuild (sessionUser, contextVersionId, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: '_createBuild',
      sessionUser, contextVersionId
    })
    log.info('called')
    return BuildService.createBuild({
      createdBy: {
        github: ownerInfo.githubUserId
      },
      owner: {
        github: ownerInfo.githubOrgId
      },
      contextVersion: contextVersionId
    }, sessionUser)
  }

  /**
   * @param  {SessionUser}   sessionUser
   * @param  {Object}        parsedInstanceData
   * @param  {String}        parsedInstanceData.build.dockerFilePath - signifies this is a repo instance
   * @param  {String=}       parsedInstanceData.build.dockerBuildContext - docker build context
   * @param  {Object}        parsedInstanceData.instance
   * @param  {String}        parsedInstanceData.instance.name
   * @param  {Array<String>} parsedInstanceData.instance.env
   * @param  {String}        parsedInstanceData.instance.containerStartCommand
   * @param  {Boolean}       parsedInstanceData.metadata.isMain
   * @param  {ObjectId}      parentBuildId
   * @param  {Object}        testingOpts
   * @param  {Boolean}       testingOpts.isTesting
   * @param  {Boolean}       testingOpts.isTestReporter
   * @param {Object}         buildOpts                     - Building options
   * @param {String=}        buildOpts.isolated            - Isolation ObjectId of the cluster
   *                                                       (if not masterpod)
   * @param {String}         buildOpts.triggeredAction     - Action that triggered creation
   * @param {String}         buildOpts.masterShorthash     - ShortHash of the master of the isolation
   * @param {String}         buildOpts.branch              - Branch of the main isolation instance
   *
   * @resolves {Instance} newly created parent instanceId
   */
  static _createInstance (sessionUser, parsedInstanceData, parentBuildId, testingOpts, buildOpts) {
    const serviceName = keypather.get(parsedInstanceData, 'metadata.name')
    const configData = parsedInstanceData.instance
    const inputInstanceOpts = pick(configData, ['aliases', 'env', 'containerStartCommand', 'name', 'ports'])
    if (buildOpts.isolated) {
      inputInstanceOpts.name = IsolationService.generateIsolatedName(
        buildOpts.masterShorthash,
        inputInstanceOpts.name
      )
    }
    const defaultInstanceOpts = {
      // short name is service name
      shortName: serviceName,
      build: parentBuildId,
      masterPod: !buildOpts.isolated,
      ipWhitelist: {
        enabled: false
      },
      shouldNotAutofork: !keypather.get(parsedInstanceData, 'metadata.isMain'),
      isIsolationGroupMaster: false,
      isolated: buildOpts.isolated,
      isTesting: testingOpts.isTesting,
      isTestReporter: testingOpts.isTestReporter
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
   * @param {SessionUser} sessionUser                - User model for the an owner with permission
   * @param {Object[]}    instanceObjs               - Dependent Instance (or empty model with config)
   * @param {Object}      instanceObjs.config        - Octobear config info (should delete instance if missing)
   * @param {Instance}    instanceObjs.config.instance.name - Name of the instance this config belongs
   * @param {Instance}    instanceObjs.instance      - Instance model (should create instance if missing)
   * @param {Object}      githubPushInfo             - Model containing GitHub push data
   * @param {String}      githubPushInfo.repo        - Full Repository Name (owner/repo)
   * @param {String}      githubPushInfo.branch      - Current branch this instance should be on
   * @param {String}      githubPushInfo.commit      - New commit this instance should be on
   * @param {Object}      githubPushInfo.user        - Model containing the pusher's data
   * @param {Number}      githubPushInfo.user.id     - GitHub ID for the pusher
   * @param {Object}      clusterOpts                            - parsed data from the compose file
   * @param {String}      clusterOpts.filePath                   - path to the cluster config file
   * @param {String}      clusterOpts.fileSha                    - md5 hash of the file
   * @param {String}      clusterOpts.clusterName                - name for the cluster
   * @param {Boolean}     clusterOpts.isTesting                  - isTesting cluster
   * @param {String}      clusterOpts.parentInputClusterConfigId - the parent ICC of the cluster
   * @param {Object}      buildOpts                  - Building options
   * @param {ObjectId=}   buildOpts.isolated         - Isolation ObjectId of the cluster
   * @param {String}      buildOpts.repoFullName     - Full repo name (user/repo) for the main instance
   * @param {String}      buildOpts.triggeredAction  - Action that triggered creation
   * @param {Object}      ownerInfo                  - Model containing owner info
   * @param {Number}      ownerInfo.bigPoppaOrgId    - Owning org's bigPoppa id
   * @param {Number}      ownerInfo.bigPoppaUserId   - User's bigPoppa id
   * @param {Number}      ownerInfo.githubOrgId      - Owning org's github id
   * @param {Number}      ownerInfo.githubUserId     - User's github id
   *
   * @returns {Promise}
   * @resolves {Instance[]} Instances which represent the requested dependencies for this isolation
   * @private
   */
  static _createUpdateAndDeleteInstancesForClusterUpdate (sessionUser, instanceObjs, githubPushInfo, clusterOpts, buildOpts, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: '_createUpdateAndDeleteInstancesForClusterUpdate',
      sessionUser, instanceObjs, githubPushInfo, buildOpts, ownerInfo
    })
    log.info('called')
    // No instance means create a new one
    // We need to create new instances first, so when we update them, the connections can be made
    // Since we need to connect aliases by ContextId, we make the instances later
    // Here, we just create the context
    const createConfigs = instanceObjs.filter(instanceObj => instanceObj.config && !instanceObj.instance)
    // if the instance and config exist, then we know we need to update
    const updateConfigs = instanceObjs.filter(instanceObj => instanceObj.config && instanceObj.instance)
    // With no config, we delete the instanceObj
    const deleteConfigs = instanceObjs.filter(instanceObj => !instanceObj.config && instanceObj.instance)

    const createContextPromises = Promise.map(createConfigs, instanceObj =>
        ClusterConfigService.createClusterContext(sessionUser, instanceObj.config, ownerInfo)
      )

    const deleteInstancePromises = Promise.map(deleteConfigs, instanceObj =>
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
        log.trace({ contextIdFilledConfigs }, 'Creating new instances')
      })
      .map(instanceDef => ClusterConfigService._createNewInstanceForNewConfig(
        sessionUser,
        instanceDef,
        clusterOpts,
        buildOpts,
        ownerInfo
      ))
      .then((newInstanceObjs) => {
        log.trace({updateConfigs}, 'Updating all instances with new configs')
        return Promise
          .map(updateConfigs, instanceObj => {
            // Do these updates last
            return ClusterConfigService._updateInstanceWithConfigs(sessionUser, instanceObj, buildOpts, ownerInfo)
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
   * @param {ObjectId=} mainInstance.isolated         - Isolation Id for the cluster
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
   * @param {Object[]}  clusterOpts.files                      - files
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
    const buildOpts = {
      isolated: mainInstance.isolated,
      masterShorthash: mainInstance.shortHash,
      branch: githubPushInfo.branch,
      repoFullName: githubPushInfo.repo,
      triggeredAction: 'autodeploy'
    }
    const ownerInfo = ClusterConfigService._getOwnerInfo(sessionUser, buildOpts.repoFullName)
    return AutoIsolationService.fetchAutoIsolationDependentInstances(mainInstance)
      .then(instanceObjects => {
        return ClusterConfigService._mergeConfigsIntoInstances(octobearInfo, instanceObjects)
      })
      .then(instanceObjects => {
        return ClusterConfigService._createUpdateAndDeleteInstancesForClusterUpdate(
          sessionUser,
          instanceObjects,
          githubPushInfo,
          clusterOpts,
          buildOpts,
          ownerInfo
        )
      })
      .then(instanceObjects =>
        ClusterConfigService.createOrUpdateIsolationConfig(
          ownerInfo,
          instanceObjects,
          clusterOpts,
          mainInstance
      ))
      .then(() => {
        const deployModel = {
          instanceId: mainInstance._id.toString(),
          pushInfo: githubPushInfo
        }
        log.info(deployModel, 'autoDeploy main instance')
        return rabbitMQ.autoDeployInstance(deployModel)
      })
      .catch(err => {
        log.error({ err }, 'failed to update')
        throw err
      })
  }

  /**
   * @param  {Object[]} configs
   * @param  {Object[]} instanceObjects
   * @param  {Instance} instanceObjects.instance
   * @return {Object[]} super objects containing both the instance and the config
   */
  static _mergeConfigsIntoInstances (configs, instanceObjects) {
    const mergedInstances = ClusterConfigService._addConfigToInstances(configs, instanceObjects)
    return ClusterConfigService._addMissingConfigs(configs, mergedInstances)
  }

  /**
   * Either updates an existing config, or creates a new one if one doesn't exist. If the main instance
   * owns the cluster (either branch or main), just update them.  If it's a branch that uses the main,
   * we need to fetch the parent's cluster, copy the data, and make a new AIC and ICC for the branch.
   *
   * @param {Object}      ownerInfo                  - Model containing owner info
   * @param {Number}      ownerInfo.bigPoppaOrgId    - Owning org's bigPoppa id
   * @param {Number}      ownerInfo.bigPoppaUserId   - User's bigPoppa id
   * @param {Number}      ownerInfo.githubOrgId      - Owning org's github id
   * @param {Number}      ownerInfo.githubUserId     - User's github id
   * @param {Object[]}    instanceObjects            - Dependent Instance (or empty model with config)
   * @param {Object}      instanceObjects.config     - Octobear config info (should delete instance if missing)
   * @param {Instance}    instanceObjects.instance   - Instance model
   * @param {Object}      clusterOpts
   * @param {Object}      clusterOpts.clusterName    - Name of the cluster
   * @param {Object[]}    clusterOpts.files          - Files def
   * @param {Object}      clusterOpts.isTesting      - True if this is a testing cluster
   * @param {Object}      clusterOpts.parentInputClusterConfigId - Main staging cluster
   * @param {Instance=}   mainInstance               - Main instance of this cluster, null if creating
   *
   * @resolves {InputClusterConfig} Updated cluster config
   */
  static createOrUpdateIsolationConfig (ownerInfo, instanceObjects, clusterOpts, mainInstance) {
    const log = ClusterConfigService.log.child({
      method: 'createOrUpdateIsolationConfig',
      ownerInfo, mainInstance
    })
    log.info('called')
    const autoIsolationModel = ClusterConfigService._createAutoIsolationModelsFromClusterInstances(
      instanceObjects,
      mainInstance
    )
    autoIsolationModel.createdByUser = ownerInfo.bigPoppaUserId
    autoIsolationModel.ownedByOrg = ownerInfo.bigPoppaOrgId
    autoIsolationModel.redeployOnKilled = clusterOpts.isTesting

    return Promise.try(() => {
      if (!mainInstance) {
        // This is null when we're in the cluster create method.
        return
      }
      // in case we need to create a new ICC, we should fetch the parent's (so we can copy)
      return ClusterConfigService.fetchConfigByInstanceId(mainInstance._id)
        .call('toJSON') // Removes all of the mongo garbage
    })
      .then(mainConfig => {
        log.trace({
          autoIsolationModel, mainConfig
        }, 'updating the autoIsolationModel')
        return AutoIsolationService.createOrUpdateAndEmit(autoIsolationModel)
          .then(autoIsolationConfig => {
            clusterOpts.createdByUser = ownerInfo.bigPoppaUserId
            clusterOpts.ownedByOrg = ownerInfo.bigPoppaOrgId
            return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, mainConfig)
          })
      })
  }

  /**
   * Returns true if the config belongs to the given instance in the instanceObj
   *
   * @param {Object}   config                         - Separated configs from Octobear
   * @param {Object}   config.metadata                - Metadata about the instance
   * @param {String}   config.metadata.name           - Service name (should match with instance.shortName)
   * @param {Object}   instanceObj
   * @param {Instance} instanceObj.instance           - Instance in the cluster
   * @param {String}   instanceObj.instance.shortName - Service name to use to match the config
   *                                                     and instance
   * @returns {boolean}
   * @private
   */
  static _compareConfigToInstanceObject (config, instanceObj) {
    if (!instanceObj.instance) {
      return false
    }
    return instanceObj.instance.shortName === config.metadata.name
  }

  /**
   * Creates super objects containing matching instances and configs.  This also adds the contextId
   * to the config
   *
   * @param {Object[]} configs                           - Separated configs from Octobear
   * @param {Object}   configs.metadata                  - Metadata about the instance
   * @param {String}   configs.metadata.name             - Service name (should match with
   *                                                     instance.shortName)
   * @param {Object[]} instanceModels                    - Array
   * @param {Object}   instanceModels.instance
   * @param {String}   instanceModels.instance.name
   * @param {String}   instanceModels.instance.shortName - Service name to use to match the config
   *                                                     and instance
   * @returns {Object[]} super objects containing both the instance and the config
   */
  static _addConfigToInstances (configs, instanceModels) {
    return instanceModels.reduce((instanceConfigObjs, model) => {
      const instance = model.instance
      const config = configs.find(config => this._compareConfigToInstanceObject(config, model))
      if (config) {
        config.contextId = keypather.get(instance, 'contextVersion.context')
        model.config = config
      }
      instanceConfigObjs.push(model)
      return instanceConfigObjs
    }, [])
  }

  static _createDockerfileContent (parsedConfigData, cvOpts, parentInfaCodeVersion) {
    const dockerFileContent = parsedConfigData.files['/Dockerfile'].body
    return ContextVersion.createWithDockerFileContent(cvOpts, dockerFileContent, { parent: parentInfaCodeVersion._id, edited: true })
  }

  /**
   * Given the array of configs and instanceObjs, add all configs (by themselves) that don't match
   * up to any of the instances to the array.  These will be deleted
   *
   * @param {Object[]} configs                         - Separated configs from Octobear
   * @param {Object}   configs.metadata                - Metadata about the instance
   * @param {String}   configs.metadata.name           - Service name (should match with instance.shortName)
   * @param {Object[]} instanceObjs                    - Objects containing the instance and the config
   * @param {Instance} instanceObjs.instance           - Instance model to compare against
   * @param {String}   instanceObjs.instance.shortName - Instance service name
   * @param {String}   instanceObjs.configs            - Config for this instanceObj
   *
   * @returns {Object[]} instanceObjs
   * @private
   */
  static _addMissingConfigs (configs, instanceObjs) {
    configs.forEach((config) => {
      if (ClusterConfigService._isConfigMissingInstance(instanceObjs, config)) {
        instanceObjs.push({ config })
      }
    })
    return instanceObjs
  }

  /**
   * Checks if the given config belongs to any of the instances in the instanceObj
   *
   * @param {Object[]} instanceObjs                    - Objects containing the instance and the config
   * @param {Instance} instanceObjs.instance           - Instance model to compare against
   * @param {String}   instanceObjs.instance.shortName - Instance service name
   * @param {Object}   config                          - Separated configs from Octobear
   * @param {Object}   config.metadata                 - Metadata about the instance
   * @param {String}   config.metadata.name            - Service name (should match with instance.shortName)
   *
   * @return {Boolean} true if config does not correspond to an instance
   */
  static _isConfigMissingInstance (instanceObjs, config) {
    return !instanceObjs.find(model => this._compareConfigToInstanceObject(config, model))
  }

  /**
   * Given an instance containing a configuration, update the instance with the properties
   *
   * @param {User}      sessionUser                - User model for the an owner with permission
   * @param {Object}    instanceObj                - Model which contains an Instance and a config
   * @param {Instance}  instanceObj.instance       - Model which contains an Instance and a config
   * @param {Object}    instanceObj.config         - Octobear config model
   * @param {String}    instanceObj.config.instance.containerStartCommand  - Container's start command
   * @param {Number[]}  instanceObj.config.instance.ports   - Array of ports to open on the instance
   * @param {String[]}  instanceObj.config.instance.env     - Array of envs for the instance (env=a)
   * @param {String}    instanceObj.config.code.commitish   - Commit or branch. Optional
   * @param {String}    instanceObj.config.build.dockerFilePath - Dockerfile path
   * @param {String=}   instanceObj.config.build.dockerBuildContext - Dockerfile build context
   * @param {Object}    buildOpts                  - Building options
   * @param {String}    buildOpts.masterShorthash  - ShortHash of the master of the isolation
   * @param {String}    buildOpts.branch           - Branch of the main isolation instance
   * @param {ObjectId=} buildOpts.isolated         - Isolation ObjectId of the cluster
   * @param {String}    buildOpts.repoFullName     - Full repo name (user/repo)
   * @param {String}    buildOpts.triggeredAction  - Action that triggered creation
   * @param {Object}    ownerInfo                  - Model containing owner info
   * @param {Number}    ownerInfo.bigPoppaOrgId    - Owning org's bigPoppa id
   * @param {Number}    ownerInfo.bigPoppaUserId   - User's bigPoppa id
   * @param {Number}    ownerInfo.githubOrgId      - Owning org's github id
   * @param {Number}    ownerInfo.githubUserId     - User's github id
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
  static _updateInstanceWithConfigs (sessionUser, instanceObj, buildOpts, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: '_updateInstanceWithConfigs',
      sessionUser, instanceObj, buildOpts, ownerInfo
    })
    log.info('called')

    return Promise.try(() => {
      // We need to determine if the instance needs to be re-built
      const cv = keypather.get(instanceObj, 'instance.contextVersion')
      const mainAcvs = keypather.get(cv, 'appCodeVersions')
      const mainACV = ContextVersion.getMainAppCodeVersion(mainAcvs) || {}
      const newCommitish = keypather.get(instanceObj.config, 'code.commitish')

      const hasCommitChanged = newCommitish &&
        mainACV.branch.toLowerCase() !== newCommitish.toLowerCase() &&
        mainACV.commit.toLowerCase() !== newCommitish.toLowerCase()

      const currentDockerfilePath = keypather.get(cv, 'buildDockerfilePath')
      const newDockerfilePath = keypather.get(instanceObj, 'config.build.dockerFilePath')
      const hasDockerfilePathChanged = (currentDockerfilePath || newDockerfilePath) &&
        currentDockerfilePath !== newDockerfilePath

      if (!hasCommitChanged && !hasDockerfilePathChanged) {
        return
      }
      return ClusterConfigService._createCVAndBuildBuild(
        sessionUser,
        ownerInfo,
        buildOpts,
        instanceObj.config
      )
    })
      .then((build) => {
        const updateQuery = {
          aliases: instanceObj.config.instance.aliases,
          env: instanceObj.config.instance.env,
          ports: instanceObj.config.instance.ports,
          containerStartCommand: instanceObj.config.instance.containerStartCommand
        }
        if (build) {
          updateQuery.build = build._id.toString()
        }
        return InstanceService.updateInstance(instanceObj.instance, updateQuery, sessionUser)
      })
      .tap(instance => rabbitMQ.redeployInstanceContainer({
        instanceId: instance._id.toString(),
        sessionUserGithubId: sessionUser.accounts.github.id
      }))
      .then(instance => {
        // After updating instance model we need to redeploy/restart instance.
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
   * @param {String=}   octobearInfo.build.dockerBuildContext - Dockerfile build context
   * @param {Object}    octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}    octobearInfo.instance         - Contains info on each instance
   * @param {String}    octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}    octobearInfo.instance.containerStartCommand     - Container's start command
   * @param {Number[]}  octobearInfo.instance.ports   - Array of ports to open on the instance
   * @param {String[]}  octobearInfo.instance.env     - Array of envs for the instance (env=a)
   * @param {Object}    clusterOpts                   - Cluster Config model
   * @param {Boolean}   clusterOpts.isTesting         - True if this is a Testing Cluster
   * @param {String[]=} clusterOpts.testReporters     - The test reporters of the cluster
   * @param {Object}    buildOpts                     - Building options
   * @param {ObjectId=} buildOpts.isolated            - Isolation ObjectId of the cluster
   * @param {String}    buildOpts.repoFullName        - Full repo name (user/repo)
   * @param {String}    buildOpts.triggeredAction     - Action that triggered creation
   * @param {Object}    ownerInfo                     - Model containing owner info
   * @param {Number}    ownerInfo.bigPoppaOrgId       - Owning org's bigPoppa id
   * @param {Number}    ownerInfo.bigPoppaUserId      - User's bigPoppa id
   * @param {Number}    ownerInfo.githubOrgId         - Owning org's github id
   * @param {Number}    ownerInfo.githubUserId        - User's github id
   *
   * @returns {Promise}
   * @resolves {Instance} - Updated Instance model with Octobear config model
   * @private
   */
  static _createNewInstanceForNewConfig (sessionUser, octobearInfo, clusterOpts, buildOpts, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: '_createNewInstanceForNewConfig',
      sessionUser, octobearInfo, clusterOpts, buildOpts, ownerInfo
    })
    log.info('called')
    const testingOpts = {
      isTesting: clusterOpts.isTesting,
      isTestReporter: clusterOpts.testReporters ? clusterOpts.testReporters.indexOf(octobearInfo.metadata.name) >= 0 : false
    }
    return ClusterConfigService.createClusterInstance(
      sessionUser,
      octobearInfo,
      testingOpts,
      buildOpts,
      ownerInfo
    )
      .then(instance => {
        return {
          instance,
          config: octobearInfo
        }
      })
  }

  /**
   * Given an instance, fetch the InputClusterConfig that rules it.  Either returns
   * the ICC belonging to the instance itself, or it's parent
   *
   * This uses parent, so it won't work with non-repos
   * @param  {ObjectId}  instanceId - Instance to fetch the ICC
   * @resolve {InputClusterConfig} The ICC that rules this instance's group
   * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
   */
  static fetchConfigByInstanceId (instanceId) {
    return AutoIsolationService.fetchAutoIsolationForInstance(instanceId)
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
   * @resolves {String}  model.sha             - sha for the Docker Compose File
   * @resolves {String}  model.path            - path for the Docker Compose File
   * @resolves {String=} model.commitRef       - Name of commit/branch/tag this file is in
   *
   */
  static fetchFileFromGithub (bigPoppaUser, repoFullName, filePath, commitRef) {
    const log = ClusterConfigService.log.child({
      method: 'fetchFileFromGithub',
      bigPoppaUser, repoFullName, filePath, commitRef
    })
    log.info('called')
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
          sha: fileContent.sha,
          path: filePath,
          commitRef
        }
      })
  }

  /**
   * Given a repo and array of filepaths, fetch all Docker Compose files.
   *
   * @param {User}     bigPoppaUser             - The bigPoppaUser model for the owner of this repo
   * @param {String}   bigPoppaUser.accessToken - The user's access token
   * @param {String}   repoFullName             - Org/Repo for the repository we want to fetch from
   * @param {String[]} filesPaths               - Array of pathfilesPathess to the Docker Compose files
   * @param {String=}  commitRef                - Name of the commit/branch/tag (leave blank for default)
   *
   * @resolves {Array[Object]}  array of file objects - each object should have `fileString`, `sha`, `path`, `commitRef`
   *
   */
  static fetchFilesFromGithub (bigPoppaUser, repoFullName, filesPaths, commitRef) {
    const log = ClusterConfigService.log.child({
      method: 'fetchFilesFromGithub',
      bigPoppaUser, repoFullName, filesPaths, commitRef
    })
    log.info('called')
    return Promise.map(filesPaths, (filePath) => {
      return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, filePath, commitRef)
    })
  }

  /**
   * Takes composeFileData (from fetchFileFromGithub) and combines it with other data to format
   * it correctly for Octobear.parse. If any `env_file` is present, then populate the ENVs
   * for those files by fetching them from github.
   *
   * @param {Object} composeFileData            - processed data on the Docker Compose File
   * @param {String} composeFileData.fileString - the Docker Compose File's realtext data
   * @param {String} composeFileData.sha        - sha for the Docker Compose File
   * @param {String} composeFileData.path       - path for the Docker Compose File
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
   * @param {Object} composeFileData                    - processed data on the Docker Compose File
   * @param {String} composeFileData.fileString         - the Docker Compose File's realtext data
   * @param {String} composeFileData.path               - path to the Docker Compose File
   * @param {String} repoFullName                        - Full repo name (Org/repo)
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
      dockerComposeFilePath: composeFileData.path,
      scmDomain: process.env.GITHUB_HOST
    }
    log.trace({ opts }, 'opts for octobera.parse')
    return octobear.parse(opts)
  }

  /**
   * Checks if the given instance has a Docker Compose config, and if it does, check if compose files were changed.
   * If it doesn't, this throws a BaseSchema.NotFoundError
   *
   * @param {Instance} instance               - Instance to look up
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
  static checkIfComposeFilesChanged (instance, githubPushInfo) {
    const log = ClusterConfigService.log.child({
      method: 'checkIfComposeFilesChanged',
      instance, githubPushInfo
    })
    log.info('called')
    return ClusterConfigService.fetchConfigByInstanceId(instance._id)
      .then(clusterConfig => {
        const currentShas = clusterConfig.files.map(pluck('sha'))
        const currentPathes = clusterConfig.files.map(pluck('path'))
        // We found a cluster, so fetch the current one, and see if it changed
        return UserService.getByGithubId(githubPushInfo.user.id)
          .then(bpUser => {
            return ClusterConfigService.fetchFilesFromGithub(
              bpUser,
              githubPushInfo.repo,
              currentPathes,
              githubPushInfo.commit
            )
          })
          .then(newComposeFiles => {
            const newShas = newComposeFiles.map(pluck('sha'))
            log.trace({
              newShas,
              newComposeFiles,
              currentShas,
              currentPathes
            }, 'new compose files')
            const diffedShas = difference(newShas, currentShas)
            if (diffedShas.length === 0) {
              throw new InputClusterConfig.NotChangedError({
                diffedShas
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
