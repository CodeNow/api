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