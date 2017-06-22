'use strict'

const joi = require('utils/joi')

exports.instanceStarted = joi.object({
  instance: joi.object({
    _id: joi.string().required(),
    owner: joi.object({
      github: joi.number().required()
    }).unknown().required(),
    contextVersion: joi.object({
      appCodeVersions: joi.array().items(
        joi.object({
          repo: joi.string().required(),
          branch: joi.string().required()
        }).unknown().label('app code version')
      ).required()
    }).unknown().required().label('context version')
  }).unknown().required(),
  container: joi.object({
    inspect: joi.object({
      Config: joi.object({
        Labels: joi.object({
          sessionUserBigPoppaId: joi.string(),
          sessionUserGithubId: joi.string()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  })
}).unknown().required()

exports.containerLifeCycleEvent = joi.object({
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        type: joi.string()
      }).unknown()
    }).unknown()
  }).unknown()
}).unknown()

exports.instanceChangedSchema = joi.object({
  timestamp: joi.date().timestamp('unix').required(),
  instance: joi.object({
    _id: joi.string().required(),
    owner: joi.object({
      github: joi.number().required()
    }).unknown().required(),
    container: joi.object({
      inspect: joi.object({
        Mounts: joi.array()
      }).unknown()
    }).unknown(),
    contextVersion: joi.object({
      appCodeVersions: joi.array().items(
        joi.object({
          repo: joi.string().required(),
          branch: joi.string().required()
        }).unknown().label('app code version')
      ).required()
    }).unknown().required().label('context version')
  }).unknown().required()
}).unknown().required()

exports.autoIsolationConfigCreated = joi.object({
  autoIsolationConfig: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  user: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    id: joi.number().required()
  }).unknown().required()
}).unknown().required()

exports.githubEvent = joi.object({
  deliveryId: joi.string().required(),
  payload: joi.object({
    repository: joi.object().required(),
    ref: joi.string().required()
  }).unknown().required()
}).unknown().required()

exports.githubPullRequestEvent = joi.object({
  deliveryId: joi.string().required(),
  payload: joi.object({
    repository: joi.object().required(),
    pull_request: joi.object().required()
  }).unknown().required()
}).unknown().required()

exports.terminalConected =
exports.terminalDataSent =
exports.logStreamConnected = joi.object({
  container: joi.object({
    id: joi.string().required(),
    isDebug: joi.boolean()
  }).unknown().required(),
  instance: joi.object({
    id: joi.string().required(),
    contextVersion: joi.object({
      id: joi.string().required(),
      appCodeVersions: joi.array().items(
        joi.object({
          repo: joi.string().required(),
          branch: joi.string().required()
        }).unknown()
      ).required()
    }).unknown().required(),
    owner: joi.object().unknown().required(),
    shortHash: joi.string()
  }).unknown().required(),
  user: joi.object({
    githubId: joi.number().required(),
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    githubId: joi.number().required(),
    githubOrgUsername: joi.string()
  }).unknown().required()
}).unknown().required()

exports.privateKeyRequested = joi.object({
  orgId: joi.number().required(),
  userId: joi.number().required(),
  githubAccessToken: joi.string().required(),
  keyName: joi.string().required()
}).unknown().required()

exports.clusterBuildBuilt = joi.object({
  clusterBuild: joi.object().unknown().required()
}).unknown().required()
