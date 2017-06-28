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
const InstanceForkService = require('models/services/instance-fork-service')
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
   * Out of all the main instances given from Octobear, choose 1 that we can use as a main.  This
   * method always chooses a build over an external first.
   *
   * @param {Object}  mains           - Main Instances, containing builds and externals
   * @param {Object}  mains.builds    - Instances that build from the owning repo (indexed by service name)
   * @param {Object}  mains.externals - Instances that pull from Github (indexed by service name)
   *
   * @returns {String} Instance service name (shortName) which is 'the main'
   * @private
   */
  static _getMainKeyFromOctobearMains (mains) {
    const buildKeys = Object.keys(mains.builds)
    if (buildKeys.length) {
      // if we have any builds, we should assume they are the main instance
      return buildKeys[0]
    }
    const externalKeys = Object.keys(mains.externals)
    if (externalKeys.length) {
      return externalKeys[0]
    }
  }

  /**
   * Returns the instance that matches the mainInstanceServiceName with it's shortName (metadata name)
   *
   * @param {Object[]} configObjects                       - Models containing an instance and config
   * @param {Object[]} configObjects.config                - Octobear parsed config data
   * @param {String}   configObjects.config.metadata.name  - ShortName that is used to identify
   *                                                       instances
   * @param {Instance} configObjects.instance              - Instance model
   * @param {String}   mainInstanceServiceName             - Instance name to search with
   *
   * @returns {Instance} Instance that matched the mainInstanceServiceName
   * @private
   */
  static _getInstanceFromServicesByShortName (configObjects, mainInstanceServiceName) {
    const log = ClusterConfigService.log.child({
      method: '_getInstanceFromServicesByShortName',
      mainInstanceServiceName,
      instanceNames: configObjects.map(pluck('config.metadata.name'))
    })
    log.info('called')
    const main = configObjects.find(instanceModels => {
      return instanceModels.config.metadata.name === mainInstanceServiceName
    })
    return main.instance
  }

  /**
   * Create Docker Compose Cluster
   * - fetch compose file content from github
   * - parse compose content
   * - call createFromRunnableConfig
   * @param {SessionUser} sessionUser                     - session user full object
   * @param {Object}      data                            - cluster data
   * @param {String}      data.mainInstanceServiceName    - main instance for this cluster
   * @param {String}      data.triggeredAction            - action that triggered creation
   * @param {String}      data.repoFullName               - full repo name E.x. Runnable/api
   * @param {String}      data.branchName                 - branch name to base cluster on
   * @param {String}      data.filePath                   - path to the cluster config file
   * @param {Boolean}     data.isTesting                  - is this testing cluster
   * @param {String[]}    data.testReporters              - array of names of the testReporters
   * @param {String}      data.clusterName                - name of the cluster
   * @param {ObjectId=}   data.parentInputClusterConfigId - Id of the parent cluster
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
    const clusterName = data.clusterName
    const branch = data.branchName
    let mainInstanceServiceName = data.mainInstanceServiceName
    const clusterCreateId = data.clusterCreateId

    return ClusterConfigService._parseComposeInfoForConfig(
      sessionUser, {
        repo: repoFullName,
        branch,
        clusterName,
        files: [{ path: filePath }],
        isTesting: data.isTesting,
        testReporters: data.testReporters,
        parentInputClusterConfigId: data.parentInputClusterConfigId
      }
    )
      .then(results => {
        if (!mainInstanceServiceName) {
          mainInstanceServiceName = ClusterConfigService._getMainKeyFromOctobearMains(results.mains)
        }
        const buildOpts = {
          clusterCreateId,
          repoFullName,
          triggeredAction: data.triggeredAction,
          mainInstanceServiceName
        }
        return ClusterConfigService.createFromRunnableConfig(
          sessionUser,
          results.services,
          buildOpts,
          results.clusterOpts,
          mainInstanceServiceName
        )
      })
  }

  /**
   * Create Cluster from parsed runnable config
   * - create new instance for each defined in the config
   * - create AutoIsolationConfig and emit `auto-isolation-config.created`
   * - create InputClusterConfig model with a link to AutoIsolationConfig
   * @param {SessionUser} sessionUser                              - session user full object
   * @param {Object[]}    runnableConfigs                          - parsed runnable config (from Octobear)
   * @param {Object}      buildOpts                                - build opts
   * @param {String}      buildOpts.mainInstanceServiceName        - Main instance service name
   * @param {String}      buildOpts.triggeredAction                - action that triggered creation
   * @param {String}      buildOpts.repoFullName                   - full repo name E.x. Runnable/api
   * @param {Object}      clusterOpts                              - parsed data from the compose file
   * @param {String}      clusterOpts.repo                         - Repository this compose file lives (owner/repo)
   * @param {String}      clusterOpts.branch                       - Branch this compose file lives
   * @param {Object[]}    clusterOpts.files                        - cluster config file models
   * @param {String}      clusterOpts.files.path                   - paths to the cluster config file
   * @param {String}      clusterOpts.files.sha                    - sha of the config file
   * @param {String}      clusterOpts.clusterName                  - name for the cluster
   * @param {Boolean}     clusterOpts.isTesting                    - isTesting cluster
   * @param {String[]=}   clusterOpts.testReporters                - array of test reporters
   * @param {ObjectId=}   clusterOpts.parentInputClusterConfigId   - the parent ICC of the cluster
   * @param {String}      mainInstanceServiceName                  - Main instance service name
   * @return {Promise}    with object that has AutoIsolationConfig
   */
  static createFromRunnableConfig (sessionUser, runnableConfigs, buildOpts, clusterOpts, mainInstanceServiceName) {
    const log = ClusterConfigService.log.child({
      method: 'createFromRunnableConfig',
      sessionUser,
      buildOpts,
      runnableConfigs,
      clusterOpts,
      mainInstanceServiceName
    })
    log.info('called')
    const ownerInfo = ClusterConfigService._getOwnerInfo(sessionUser, buildOpts.repoFullName)
    return Promise
      .each(runnableConfigs, instanceDef => ClusterConfigService.createClusterContext(
        sessionUser,
        instanceDef,
        ownerInfo
      ))
      .each(instanceDef => ClusterConfigService._addBranchName(
        instanceDef,
        clusterOpts
      ))
      .tap(ClusterConfigService.addAliasesToContexts)
      .map(instanceDef => ClusterConfigService._createNewInstanceForNewConfig(
        sessionUser,
        instanceDef,
        clusterOpts,
        buildOpts,
        ownerInfo
      ))
      .then(instancesWithConfigs => {
        const mainInstance = ClusterConfigService._getInstanceFromServicesByShortName(
          instancesWithConfigs,
          mainInstanceServiceName
        )
        return ClusterConfigService.createIsolationConfig(
          ownerInfo,
          instancesWithConfigs,
          clusterOpts,
          mainInstance
        )
      })
      .catch((err) => {
        err.clusterCreateId = buildOpts.clusterCreateId
        throw err
      })
  }

  /**
   * Add the branch name from the cluster to the instance if there is a build
   *
   * @param {Object} instanceDef       - Instance definition
   * @param {Object} instanceDef.build - Build Object for instance
   * @param {Object} clusterOpts       - Cluster options
   * @param {Object} clusterOpts       - Branch name for cluster (only used in main instance)
   * @return {Object} instanceDef
   */
  static _addBranchName (instanceDef, clusterOpts) {
    if (instanceDef.build && !keypather.get(instanceDef, 'code.repo') && clusterOpts.branch) {
      // Only add branch to builds that don't point to a git repo
      instanceDef.metadata.branch = clusterOpts.branch
    }
    return instanceDef
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
   * @param {Instance} mainInstance                                - Main instance model of the config
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
    const requestedDependencies = instancesWithConfigs.filter(instanceObj => {
      return instanceObj.instance._id.toString() !== mainInstance._id.toString()
    })
      .map(instanceObj => {
        // If there's a build property and it's not main and it's not a github repo,
        // then match the branch
        const hasBuildDockerfilePath = !!keypather.get(instanceObj, 'config.build.dockerFilePath')
        const isGithubRepo = !!keypather.get(instanceObj, 'config.code.repo')
        const matchBranch = (hasBuildDockerfilePath && !isGithubRepo) || undefined
        log.trace({ hasBuildDockerfilePath, isGithubRepo, matchBranch }, 'Check for matched branch')
        return {
          instance: instanceObj.instance._id,
          matchBranch
        }
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
   * - create job to delete each instance
   * - mark cluster as deleted
   * @param {ObjectId} clusterId - id of the AutoIsolationConfig
   */
  static delete (clusterId) {
    const log = ClusterConfigService.log.child({
      method: 'delete',
      clusterId
    })
    log.info('called')
    return AutoIsolationConfig.findByIdAndAssert(clusterId)
      .tap((cluster) => {
        const instancesIds = cluster.instancesIds || []
        return Promise.each(instancesIds, (instanceId) => rabbitMQ.deleteInstance({ instanceId }))
      })
      .tap(() => {
        return InputClusterConfig.findActiveByAutoIsolationId(clusterId)
          .then((icc) => InputClusterConfig.markAsDeleted(icc._id))
      })
      .tap(() => {
        return AutoIsolationConfig.markAsDeleted(clusterId)
      })
      .tap(() => {
        return rabbitMQ.clusterDeleted({ cluster: { id: clusterId } })
      })
  }

  /**
   * Finds all ICC that share the same parent and repo, branch, isTesting, and filePaths as the AIC
   * given
   *
   * @param {String} clusterId - Id of an AutoIsolationConfig that relates to all the ones
   *                             we want to delete
   */
  static findAllRelatedClusters (clusterId) {
    const log = ClusterConfigService.log.child({
      method: 'findAllRelatedClusters',
      autoIsolationConfig: {
        clusterId
      }
    })
    log.info('called')
    return InputClusterConfig.findActiveByAutoIsolationId(clusterId)
      .then((icc) => {
        // now, we need to get the parent, unless this is the parent
        if (!icc.parentInputClusterConfigId) {
          return icc
        }
        return InputClusterConfig.findActiveParentIcc(icc)
      })
      .then((parentIcc) => {
        // Now we need to fetch all similar parents
        return InputClusterConfig.findSimilarActive(parentIcc)
      })
      .then((parentIccs) => {
        // Now we need to fetch all these parents' children
        return InputClusterConfig.findAllChildren(parentIccs)
          .then((childIccs) => parentIccs.concat(childIccs))
      })
      .each((cluster) => AutoIsolationConfig.findByIdAndAssert(cluster.autoIsolationConfigId))
  }

  /**
   * Delete all clusters with same ICC by taking in a clusterId and then finding all ICC that
   * share the same parent and repo, branch, isTesting, and filePaths
   *
   * @param {String} clusterId - Id of an AutoIsolationConfig that relates to all the ones
   *                           we want to delete
   */
  static deleteAllICC (clusterId) {
    const log = ClusterConfigService.log.child({
      method: 'deleteAllICC',
      autoIsolationConfig: {
        clusterId
      }
    })
    log.info('called')
    return ClusterConfigService.findAllRelatedClusters
      .each((cluster) => rabbitMQ.deleteCluster(cluster))
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
   * @param {ObjectId}      parsedInstanceData.contextId
   * @param {String}        parsedInstanceData.build.dockerFilePath
   * @param {String=}       parsedInstanceData.build.dockerBuildContext
   * @param {Object}        parsedInstanceData.files
   * @param {String}        parsedInstanceData.instance.name
   * @param {String[]}      parsedInstanceData.instance.env
   * @param {String}        parsedInstanceData.instance.containerStartCommand
   * @param {String}        parsedInstanceData.code.repo        - Repo name
   * @param {String}        parsedInstanceData.code.commitish   - Can be commit or branch.
   * @param {Object}        testingOpts
   * @param {Boolean}       testingOpts.isTesting
   * @param {Boolean}       testingOpts.isTestReporter
   * @param {Object}        buildOpts                         - Building options
   * @param {String}        buildOpts.mainInstanceServiceName - Main instance service name
   * @param {String}        buildOpts.masterShorthash         - ShortHash of the master of the isolation
   * @param {String}        buildOpts.branch                  - Branch of the main isolation instance
   * @param {ObjectId=}     buildOpts.isolated                - Isolation ObjectId of the cluster
   * @param {String}        buildOpts.repoFullName            - Full repo name (user/repo)
   * @param {Object|String} buildOpts.triggeredAction         - Action that triggered creation
   * @param {Object}        ownerInfo                         - Model containing owner info
   * @param {Number}        ownerInfo.bigPoppaOrgId           - Owning org's bigPoppa id
   * @param {Number}        ownerInfo.bigPoppaUserId          - User's bigPoppa id
   * @param {Number}        ownerInfo.githubOrgId             - Owning org's github id
   * @param {Number}        ownerInfo.githubUserId            - User's github id
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
   * @param {Object}      ownerInfo                        - Model containing owner info
   * @param {Number}      ownerInfo.bigPoppaOrgId          - Owning org's bigPoppa id
   * @param {Number}      ownerInfo.bigPoppaUserId         - User's bigPoppa id
   * @param {Number}      ownerInfo.githubOrgId            - Owning org's github id
   * @param {Number}      ownerInfo.githubUserId           - User's github id
   * @param {Object}      buildOpts                        - Building options
   * @param {String}      buildOpts.repoFullName           - Full repo name (user/repo)
   * @param {Object}      parsedConfigData                 - Octobear config info
   * @param {Object}      parsedConfigData.metadata        - Metadata object
   * @param {Object}      parsedConfigData.metadata.branch - Branch name
   * @param {ObjectId}    parsedConfigData.contextId       - contextId to version off of
   * @param {Object=}     parsedConfigData.files
   * @param {String}      parsedConfigData.build.dockerFilePath
   * @param {String=}     parsedConfigData.build.dockerBuildContext
   * @param {String=}     parsedConfigData.code.repo      - Repo name
   * @param {String=}     parsedConfigData.code.commitish - Can be commit or branch.
   * But commit will be ignored, since for app code version we need both commit and branch and we can't
   * find branch name using commit in git. Optional parameter.
   * If not specified default branch would be used for app code version creation
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
        const isMain = keypather.get(parsedConfigData, 'metadata.isMain')
        const codeConfig = keypather.get(parsedConfigData, 'code')
        if (!isMain && keypather.get(parsedConfigData, 'files[\'/Dockerfile\']')) {
          return ClusterConfigService._createDockerfileContent(parsedConfigData, cvOpts, parentInfaCodeVersion)
        }
        let instanceRepoName = buildOpts.repoFullName
        let instanceBranch = null
        const metadataBranchName = keypather.get(parsedConfigData, 'metadata.branch')
        if (parsedConfigData.build && metadataBranchName) {
          instanceBranch = metadataBranchName
        }
        if (codeConfig && codeConfig.repo) {
          instanceRepoName = codeConfig.repo
          instanceBranch = codeConfig.commitish || null
        }
        log.trace({
          instanceRepoName,
          instanceBranch
        }, 'service repo name')
        return ContextVersion.createAppcodeVersion(sessionUser, instanceRepoName, instanceBranch)
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
   * @param  {ObjectId}      parentBuildId
   * @param  {Object}        testingOpts
   * @param  {Boolean}       testingOpts.isTesting
   * @param  {Boolean}       testingOpts.isTestReporter
   * @param {Object}         buildOpts                         - Building options
   * @param {String=}        buildOpts.isolated                - Isolation ObjectId of the cluster
   *                                                           (if not masterpod)
   * @param {String}         buildOpts.mainInstanceServiceName - Main instance service name
   * @param {String}         buildOpts.triggeredAction         - Action that triggered creation
   * @param {String}         buildOpts.masterShorthash         - ShortHash of the master of the isolation
   * @param {String}         buildOpts.branch                  - Branch of the main isolation instance
   *
   * @resolves {Instance} newly created parent instanceId
   */
  static _createInstance (sessionUser, parsedInstanceData, parentBuildId, testingOpts, buildOpts) {
    const serviceName = keypather.get(parsedInstanceData, 'metadata.name')
    const configData = parsedInstanceData.instance
    const inputInstanceOpts = pick(configData, ['aliases', 'env', 'containerStartCommand', 'name', 'ports'])
    if (buildOpts.isolated) {
      inputInstanceOpts.name = InstanceForkService.generateIsolatedName(
        buildOpts.masterShorthash,
        inputInstanceOpts.name
      )
    }
    const shouldNotAutofork = keypather.get(parsedInstanceData, 'metadata.name') !== buildOpts.mainInstanceServiceName
    const defaultInstanceOpts = {
      // short name is service name
      shortName: serviceName,
      build: parentBuildId,
      clusterCreateId: buildOpts.clusterCreateId,
      masterPod: !buildOpts.isolated,
      ipWhitelist: {
        enabled: false
      },
      shouldNotAutofork: shouldNotAutofork,
      isolated: buildOpts.isolated,
      isTesting: testingOpts.isTesting,
      isTestReporter: testingOpts.isTestReporter
    }
    if (buildOpts.isolated) {
      // We don't want to set false here, since only isolated containers should have this field
      defaultInstanceOpts.isIsolationGroupMaster = false
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
  static _createUpdateAndDeleteInstancesForClusterUpdate (sessionUser, instanceObjs, clusterOpts, buildOpts, ownerInfo) {
    const log = ClusterConfigService.log.child({
      method: '_createUpdateAndDeleteInstancesForClusterUpdate',
      sessionUser, instanceObjs, buildOpts, ownerInfo
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
   * @param {Boolean}   mainInstance.shortName        - ShortName of the instance
   * @param {Object}    githubPushInfo                - Model containing GitHub push data
   * @param {String}    githubPushInfo.repo           - Full Repository Name (owner/repo)
   * @param {String}    githubPushInfo.branch         - Current branch this instance should be on
   * @param {String}    githubPushInfo.commit         - New commit this instance should be on
   * @param {Number}    githubPushInfo.bpUserId       - BigPoppa user id for the pusher user
   * @param {Object[]}  octobearInfo                  - Parsed data from the Docker Compose File
   * @param {String}    octobearInfo.metaData.name    - Name of the service
   * @param {Boolean}   octobearInfo.metaData.isMain  - True if the service is the main instance
   * @param {Object}    octobearInfo.files            - Contains the dockerfile body (Optional)
   * @param {Object}    octobearInfo.instance         - Contains info on each instance
   * @param {String}    octobearInfo.instance.name    - Instance's name (different from compose file)
   * @param {String}    octobearInfo.instance.containerStartCommand  - Container's start command
   * @param {Number[]}  octobearInfo.instance.ports  - Array of ports to open on the instance
   * @param {String[]}  octobearInfo.instance.env    - Array of envs for the instance (env=a)
   * @param {Object}    clusterOpts                  - parsed data from the compose file
   * @param {String}    clusterOpts.repo             - Repository this compose file lives (owner/repo)
   * @param {String}    clusterOpts.branch           - Branch this compose file should be on
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
      triggeredAction: 'autodeploy',
      mainInstanceServiceName: mainInstance.shortName
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
          clusterOpts,
          buildOpts,
          ownerInfo
        )
      })
      .then(instanceObjects =>
        ClusterConfigService.updateIsolationConfig(
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
   * @param {String}      clusterOpts.repo           - full repo where the ICC exists (user/repo)
   * @param {String}      clusterOpts.branch         - branch where this ICC exists
   * @param {Object}      clusterOpts.clusterName    - Name of the cluster
   * @param {Object[]}    clusterOpts.files          - Files def
   * @param {Object}      clusterOpts.isTesting      - True if this is a testing cluster
   * @param {Object}      clusterOpts.parentInputClusterConfigId - Main staging cluster
   * @param {Instance}    mainInstance               - Main instance of this cluster, null if creating
   * @param {InputClusterConfig=} mainConfig         - Current main instance's ICC (for updating)
   *
   * @resolves {InputClusterConfig} Updated cluster config
   */
  static createIsolationConfig (ownerInfo, instanceObjects, clusterOpts, mainInstance, mainConfig) {
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

    return AutoIsolationService.createOrUpdateAndEmit(autoIsolationModel)
      .then(autoIsolationConfig => {
        clusterOpts.createdByUser = ownerInfo.bigPoppaUserId
        clusterOpts.ownedByOrg = ownerInfo.bigPoppaOrgId
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, mainConfig)
      })
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
   * @param {String}      clusterOpts.repo           - full repo where the ICC exists (user/repo)
   * @param {String}      clusterOpts.branch         - branch where this ICC exists
   * @param {Object}      clusterOpts.clusterName    - Name of the cluster
   * @param {Object[]}    clusterOpts.files          - Files def
   * @param {Object}      clusterOpts.isTesting      - True if this is a testing cluster
   * @param {Object}      clusterOpts.parentInputClusterConfigId - Main staging cluster
   * @param {Instance}    mainInstance               - Main instance of this cluster, null if creating
   *
   * @resolves {InputClusterConfig} Updated cluster config
   */
  static updateIsolationConfig (ownerInfo, instanceObjects, clusterOpts, mainInstance) {
    const log = ClusterConfigService.log.child({
      method: 'createOrUpdateIsolationConfig',
      ownerInfo, mainInstance
    })
    log.info('called')

    return ClusterConfigService.fetchConfigByInstanceId(mainInstance._id)
      .call('toJSON') // Removes all of the mongo garbage
      .then(mainConfig => ClusterConfigService.createIsolationConfig(
        ownerInfo,
        instanceObjects,
        clusterOpts,
        mainInstance,
        mainConfig
      ))
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
   * @param {Object}    octobearInfo                  - Parsed data from the Docker Compose File
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
   * @param {String}    buildOpts.mainInstanceServiceName - Main instance service name
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
   * @resolves {String}  model.repo            - Org/Repo for the repository we want to fetch from
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
          repo: repoFullName,
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
   * Given filePath to the main compose file fetch all compose files.
   *
   * @param {User}    bigPoppaUser             - The bigPoppaUser model for the owner of this repo
   * @param {String}  bigPoppaUser.accessToken - The user's access token
   * @param {String}  repoFullName             - Org/Repo for the repository we want to fetch from
   * @param {String}  filesPath                - Array of pathfilesPathess to the Docker Compose files
   * @param {String=} commit                   - Name of the commit/branch/tag (leave blank for default)
   *
   * @resolves {Array[]}  array where the first element is the array of all file contents and the second one is the
   * array of file def objects (path and sha) that we use to store in the ICC model
   */
  static fetchAllComposeFilesFromMain (bigPoppaUser, repoFullName, filePath, commit) {
    const log = ClusterConfigService.log.child({
      method: 'fetchAllComposeFilesFromMain',
      bigPoppaUser, repoFullName, filePath, commit
    })
    log.info('called')
    return ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, filePath, commit)
      .then((mainComposeFile) => {
        return octobear.findExtendedFiles(mainComposeFile.fileString)
          .then((allFilesPathes) => {
            return ClusterConfigService.fetchFilesFromGithub(bigPoppaUser, repoFullName, allFilesPathes)
          })
          .then((additionalComposeFiles) => {
            // order of concat is important. Main file should be the main one
            const allComposeFiles = [ mainComposeFile ].concat(additionalComposeFiles)
            const allFilesContents = allComposeFiles.map((file) => {
              return {
                dockerComposeFileString: file.fileString,
                dockerComposeFilePath: file.path
              }
            })
            const allFilesDefs = allComposeFiles.map((file) => {
              return {
                path: file.path,
                sha: file.sha
              }
            })
            return [ allFilesContents, allFilesDefs ]
          })
      })
  }

  /**
   * Fetches all compose files starting from the main one and parses them all together
   *
   * @param {String} repoFullName               - Full repo name (Org/repo)
   * @param {String} clusterName                - Name that the cluster
   * @param {User}   bigPoppaUser               - The bigPoppaUser model for the owner of this repo
   * @param {String} filePath                   - Original file path to the compose file
   * @param {String} commit                     - Commit used to fetch files
   *
   * @resolves {Object[]} octobearInfo                  - Parsed data from the Docker Compose File
   * @resolves {Array}    octobearInfo.results          - Parsed array of service definitions
   * @resolves {Array}    octobearInfo.files            - Array of files definitions (object with `path` and `sha`)
   * @resolves {Object}   octobearInfo.mains            - Main Instances, containing builds and externals
   * @resolves {Object}   octobearInfo.mains.builds     - Instances that build from the owning repo
   * @resolves {Object}   octobearInfo.mains.externals  - Instances that pull from Github
   */
  static parseComposeFileAndPopulateENVs (repoFullName, clusterName, bigPoppaUser, filePath, commit) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFileAndPopulateENVs',
      repoFullName, clusterName, filePath
    })
    log.info('called')
    return ClusterConfigService.fetchAllComposeFilesFromMain(bigPoppaUser, repoFullName, filePath, commit)
      .spread((filesContents, filesDefs) => {
        return ClusterConfigService.parseComposeFilesIntoServices(filesContents, filesDefs, repoFullName, clusterName,
          bigPoppaUser, commit, filePath)
      })
  }
  /**
   * Parse all fetched files
   * @param {Array}  composeFilesContents  - Compose files with contents
   * @param {Array}  filesDefs             - Files info we have on the ICC model as `files`
   * @param {String} repoFullName          - Full repo name (Org/repo)
   * @param {String} clusterName           - Name that the cluster
   * @param {User}   bigPoppaUser          - The bigPoppaUser model for the owner of this repo
   * @param {String} commitRef             - Commit used to fetch files
   * @param {String} rootFilePath          - Original file path to the compose file
   *
   * @resolves {Object}   octobearInfo                 - Parsed data from the Docker Compose File
   *           {Array}    octobearInfo.results         - Parsed array of service definitions
   *           {Array}    octobearInfo.files           - Array of files definitions (object with `path` and `sha`)
   *           {Object}   octobearInfo.mains           - Main Instances, containing builds and externals
   *           {Object}   octobearInfo.mains.builds    - Instances that build from the owning repo
   *           {Object}   octobearInfo.mains.externals - Instances that pull from Github
   */
  static parseComposeFilesIntoServices (composeFilesContents, filesDefs, repoFullName, clusterName, bigPoppaUser, commitRef, rootFilePath) {
    const log = ClusterConfigService.log.child({
      method: 'parseComposeFilesIntoServices',
      composeFilesContents, filesDefs, repoFullName, clusterName, bigPoppaUser, commitRef, rootFilePath
    })
    log.info('called')
    const opts = {
      repositoryName: clusterName,
      ownerUsername: GitHub.getOrgFromFullRepoName(repoFullName),
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      dockerComposeFilePath: rootFilePath,
      scmDomain: process.env.GITHUB_HOST
    }
    return octobear.parseAndMergeMultiple(opts, composeFilesContents)
      .then(parsedResult => {
        log.trace({ parsedResult }, 'Parsed docker compose files')
        const fileFetches = parsedResult.envFiles.reduce((obj, fileName) => {
          obj[fileName] = ClusterConfigService.fetchFileFromGithub(bigPoppaUser, repoFullName, fileName, commitRef).then(f => f.fileString)
          return obj
        }, {})
        return [parsedResult.results, Promise.props(fileFetches), parsedResult.mains]
      })
      .spread((services, fileFetches, mains) => {
        log.trace({ services, fileFetches }, 'Fetches all files from Github')
        return octobear.populateENVsFromFiles(services, fileFetches)
          .tap(services => {
            return ClusterConfigService.updateBuildContextForEachService(rootFilePath, services)
          })
          .then(services => {
            log.trace({ services }, 'Finished populating ENVs')
            return { results: services, files: filesDefs, mains: mains }
          })
      })
  }

  /**
   * Checks if the given instance has a Docker Compose config, and if it does, check if compose files were changed.
   * If it doesn't, this throws a BaseSchema.NotFoundError
   *
   * @param {Instance} instance                - Instance to look up
   * @param {Object}   githubPushInfo          - Github webhook push data
   * @param {String}   githubPushInfo.repo     - Github repositories full name (org/repo)
   * @param {String}   githubPushInfo.commit   - Commit for this push
   * @param {String}   githubPushInfo.bpUserId - BigPoppa user id
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
    return Promise.props({
      aic: AutoIsolationService.fetchAutoIsolationForInstance(instance._id),
      clusterConfig: ClusterConfigService.fetchConfigByInstanceId(instance._id)
    })
      .then(results => {
        const clusterConfig = results.clusterConfig
        const currentPaths = clusterConfig.files.map(pluck('path'))
        // We found a cluster, so fetch the current one, and see if it changed
        return UserService.getByBpId(githubPushInfo.bpUserId)
          .then(bpUser => {
            return ClusterConfigService.fetchFilesFromGithub(
              bpUser,
              githubPushInfo.repo,
              currentPaths,
              githubPushInfo.commit
            )
          })
          .then(newComposeFiles => {
            const currentShas = clusterConfig.files.map(pluck('sha'))
            const newShas = newComposeFiles.map(pluck('sha'))
            log.trace({
              newShas,
              currentShas,
              currentPaths
            }, 'new compose files')
            const diffedShas = difference(newShas, currentShas)
            const aic = results.aic
            // We want branches to act like they've changed, so they make their own ICC and AIC
            if (diffedShas.length === 0 && instance._id === aic.instance) {
              throw new InputClusterConfig.NotChangedError({
                newShas,
                currentShas
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

  /**
   * If you need to do an updateCluster job, use this method.  It checks if the compose file has changed
   * before creating the job.
   * @param    {Instance} instance        - instance to be updated
   * @param    {Object}   githubPushInfo  - parsed githook data
   *
   * @resolves {undefined}
   *
   * @throws InputClusterConfig.NotChangedError - When the config's sha's match, so this won't be done
   * @throws InputClusterConfig.NotFoundError - When no config is found to match the given instance
   */
  static checkFileChangeAndCreateUpdateJob (instance, githubPushInfo) {
    const log = ClusterConfigService.log.child({
      method: 'checkFileChangeAndCreateUpdateJob',
      instance, githubPushInfo
    })
    log.info('called')
    return ClusterConfigService.checkIfComposeFilesChanged(instance, githubPushInfo)
      .then(() => rabbitMQ.updateCluster({
        instanceId: instance._id.toString(),
        pushInfo: githubPushInfo
      }))
      .catch(err => {
        log.warn({ err }, 'Cluster could not be checked or updated')
        throw err
      })
  }

  /**
   * Used during update, this method fetches an existing cluster and parses the compose info
   *
   * @param {SessionUser} sessionUser                - User model for the an owner with permission
   * @param {User}        sessionUser.bigPoppaUser   - User model from Big Poppa
   * @param {ObjectId}    instanceId                 - Id for the instance that we are updating
   * @param {Object}      githubPushInfo             - Github push info from the webhook
   * @param {Object}      githubPushInfo.branch      - Branch effected by this git push
   * @param {Object}      githubPushInfo.commit      - New commit of this git push
   * @param {Object}      githubPushInfo.repo        - Full RepoName (User/Repository)
   *
   * @resolves {Object}    results
   *           {Object}    results.clusterOpts                - Modified with commit and files
   *           {String}    results.clusterOpts.repo           - Repository where the compose file exists
   *           {String}    results.clusterOpts.branch         - Branch where the compose file exists
   *           {String=}   results.clusterOpts.commit         - The exact commit sha to get the file from
   *           {String}    results.clusterOpts.clusterName    - Name of the cluster to be saved
   *           {Object[]}  results.clusterOpts.files          - Compose files
   *           {String}    results.clusterOpts.files.path     - Path to the compose files
   *           {String}    results.clusterOpts.files.sha      - Unique sha for this file
   *           {Boolean}   results.clusterOpts.isTesting      - True if this is a testing cluster
   *           {String[]=} results.clusterOpts.testReporters  - The test reporters of the cluster
   *           {ObjectId=} results.clusterOpts.parentInputClusterConfigId - The test reporters of the cluster
   *           {Object}    results.services                   - Parsed data from the compose files
   */
  static fetchComposeInfoByInstanceId (sessionUser, instanceId, githubPushInfo) {
    const log = ClusterConfigService.log.child({
      method: 'fetchComposeInfoByInstanceId',
      sessionUser, instanceId, githubPushInfo
    })
    log.info('called')
    return ClusterConfigService.fetchConfigByInstanceId(instanceId)
      .tap(config => {
        if (githubPushInfo && githubPushInfo.repo === config.repo) {
          // if the repo of the config is the same as the push info, we need to use the commit
          // value from the pushInfo, instead of using the branch.  This is because this instance
          // is the owner of the compose file, and we want to make sure we're using the newest file
          config.commit = githubPushInfo.commit
        }
      })
      .then(config => ClusterConfigService._parseComposeInfoForConfig(sessionUser, config))
  }

  /**
   * Given clusterOpts, parse the relevant data for a Cluster Config model so we can create or update
   * a cluster.  This takes into account that the clusterOpts value given already has the
   * repo, branch, and commit data set correctly.  If the commit isn't in the clusterOpts, the branch
   * is fetched from Github to get the latest commit for it
   *
   * @param {SessionUser}    sessionUser                - User model for the an owner with permission
   * @param {User}           sessionUser.bigPoppaUser   - User model from Big Poppa
   * @param {Object}         clusterOpts                - Contains info we should use to create this cluster
   * @param {String}         clusterOpts.repo           - Repository where the compose file exists
   * @param {String}         clusterOpts.branch         - Branch where the compose file exists
   * @param {String=}        clusterOpts.commit         - The exact commit sha to get the file from
   * @param {String}         clusterOpts.clusterName    - Name of the cluster to be saved
   * @param {Object[]}       clusterOpts.files          - Compose files
   * @param {String}         clusterOpts.files.path     - Path to the compose files
   * @param {Boolean}        clusterOpts.isTesting      - True if this is a testing cluster
   * @param {String[]=}      clusterOpts.testReporters  - The test reporters of the cluster
   * @param {ObjectId=}      clusterOpts.parentInputClusterConfigId - The test reporters of the cluster
   *
   * @resolves {Object}    results
   *           {Object}    results.clusterOpts                - Modified with commit and files
   *           {String}    results.clusterOpts.repo           - Repository where the compose file exists
   *           {String}    results.clusterOpts.branch         - Branch where the compose file exists
   *           {String=}   results.clusterOpts.commit         - The exact commit sha to get the file from
   *           {String}    results.clusterOpts.clusterName    - Name of the cluster to be saved
   *           {Object[]}  results.clusterOpts.files          - Compose files
   *           {String}    results.clusterOpts.files.path     - Path to the compose files
   *           {String}    results.clusterOpts.files.sha      - Unique sha for this file
   *           {Boolean}   results.clusterOpts.isTesting      - True if this is a testing cluster
   *           {String[]=} results.clusterOpts.testReporters  - The test reporters of the cluster
   *           {ObjectId=} results.clusterOpts.parentInputClusterConfigId - The test reporters of the cluster
   *           {Object}    results.services                   - Parsed data from the compose files
   * @private
   */
  static _parseComposeInfoForConfig (sessionUser, clusterOpts) {
    const log = ClusterConfigService.log.child({
      method: '_parseComposeInfoForConfig',
      sessionUser, clusterOpts
    })
    log.info('called')
    const bigPoppaUser = sessionUser.bigPoppaUser
    return Promise.try(() => {
      if (clusterOpts.commit) {
        return
      }
      // If the commit wasn't set on this value, then we need to fetch the latest commit
      // for the specified branch
      const token = keypather.get(sessionUser, 'accounts.github.accessToken')
      const github = new GitHub({token})
      return github.getBranchAsync(clusterOpts.repo, clusterOpts.branch)
        .then(branchInfo => keypather.get(branchInfo, 'commit.sha'))
        .tap(commit => Object.assign(clusterOpts, {commit}))
    })
      .then(() => {
        const repo = clusterOpts.repo
        const commit = clusterOpts.commit
        const filePath = clusterOpts.files[0].path

        log.trace({clusterOpts}, 'Fetched github branch. Fetching compose file from github')
        return ClusterConfigService.parseComposeFileAndPopulateENVs(
          repo,
          clusterOpts.clusterName,
          bigPoppaUser,
          filePath,
          commit
        )
      })
      .then(octobearInfo => {
        // Save the files onto the cluster opts
        clusterOpts.files = octobearInfo.files
        return {
          clusterOpts,
          services: octobearInfo.results,
          mains: octobearInfo.mains
        }
      })
  }

  /**
   * Reduces a map of objects to an array of unique entities based on a certain value
   * in each object.
   *
   * @param {Object} objectWithKeys    - map of objects to reduce
   * @param {String} pathToUniqueValue - keypath in the objects to use as a hash key
   *
   * @returns {String[]} list of unique keys in the given objectWithKeys
   * @private
   */
  static _uniquePathReduce (objectWithKeys, pathToUniqueValue) {
    const pathMap = {}
    return Object.keys(objectWithKeys).reduce((list, key) => {
      let uniquePath = keypather.get(objectWithKeys[key], pathToUniqueValue)
      if (path && !pathMap[uniquePath]) {
        pathMap[uniquePath] = objectWithKeys[key]
        list.push(key)
      }
      return list
    }, [])
  }

  /**
   * Sorts out the unique masters from the OctobearInfo.  Uniqueness depends on dockerfilePath of
   * the builds, and the repo of the externals
   *
   * @param {Object}   octobearInfo                 - Parsed data from the Docker Compose File
   * @param {Object}   octobearInfo.mains           - Main Instances, containing builds and externals
   * @param {Object<String, Object>} octobearInfo.mains.builds    - Instances that build from the owning repo
   * @param {Object}   octobearInfo.mains.builds.$.build.dockerFilePath - Path to the dockerfile
   * @param {Object}   octobearInfo.mains.externals - Instances that pull from Github
   *
   * @return {Object}   results           - unique externals and builds (by dockerFilePath)
   *         {Object[]} results.builds    - unique build instance names (Service Name key)
   *         {Object[]} results.externals - unique externals instance names (Service Name key)
   */
  static getUniqueServicesKeysFromOctobearResults (octobearInfo) {
    const builds = octobearInfo.mains.builds
    const externals = octobearInfo.mains.externals

    return {
      builds: ClusterConfigService._uniquePathReduce(builds, 'build.dockerFilePath'),
      externals: ClusterConfigService._uniquePathReduce(externals, 'repo')
    }
  }
}
