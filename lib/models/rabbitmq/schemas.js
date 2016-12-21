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

const parsedComposeInstanceData = joi.object({
  metadata: joi.object({
    name: joi.string(),
    isMain: joi.boolean()
  }).unknown(),
  contextVersion: joi.object({
    advanced: joi.boolean(),
    buildDockerfilePath: joi.string()
  }).unknown(),
  files: joi.object({}).unknown(),
  instance: joi.object({
    name: joi.string(),
    containerStartCommand: joi.string(),
    ports: joi.array().items(joi.number()),
    env: joi.array().items(joi.string())
  }).unknown()
}).unknown().required()

exports.autoIsolationConfigCreated = joi.object({
  autoIsolationConfig: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  meta: joi.object({
    inputClusterConfig: joi.object({
      id: joi.string()
    }).unknown(),
    parsedCompose: joi.object({
      results: joi.array().items(parsedComposeInstanceData).min(0)
    }).unknown(),
    triggeredAction: joi.string().valid('user', 'webhook'),
    repoFullName: joi.string()
  }).unknown(),
  user: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    id: joi.number().required()
  }).unknown().required()
}).unknown().required()

exports.clusterCreated = joi.object({
  autoIsolationConfig: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  inputClusterConfig: joi.object({
    id: joi.string()
  }).unknown().required(),
  parsedCompose: joi.object({
    results: joi.array().items(parsedComposeInstanceData).required().min(0)
  }).required(),
  user: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required()
}).unknown().required()

exports.clusterInstanceCreated = joi.object({
  autoIsolationConfig: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  inputClusterConfig: joi.object({
    id: joi.string()
  }).unknown().required(),
  instance: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  parsedComposeInstanceData: parsedComposeInstanceData,
  user: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required()
}).unknown().required()

exports.clusterInstanceCreate = joi.object({
  autoIsolationConfig: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  inputClusterConfig: joi.object({
    id: joi.string()
  }).unknown().required(),
  parsedComposeInstanceData: parsedComposeInstanceData,
  user: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  organization: joi.object({
    id: joi.number().required()
  }).unknown().required(),
  triggeredAction: joi.string().required().valid('user', 'webhook'),
  repoFullName: joi.string().required()
}).unknown().required()
