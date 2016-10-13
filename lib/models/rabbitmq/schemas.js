'use strict'

const joi = require('utils/joi')

exports.instanceStarted = joi.object({
  instanceId: joi.string().required(),
  githubOrgId: joi.number().required(),
  githubUserId: joi.number(),
  bigPoppaUserId: joi.number()
}).unknown().required()
