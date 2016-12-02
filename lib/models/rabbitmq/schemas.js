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

exports.clusterCreated = joi.object({
  cluster: joi.object({
    id: joi.string().required()
  }).unknown().required(),
  parsedCompose: joi.object({}).unknown().required()
}).unknown().required()
