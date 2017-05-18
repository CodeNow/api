'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

module.exports.jobSchema = joi.object({
  orgId: joi.number().required(),
  userId: joi.number().required()
}).unknown().required()

module.exports.task = (job) => {
  let bigPoppaId = job.orgId.toString()

  return bigPoppaClient.getOrganization(bigPoppaId)
    .then((org) => {
      console.log('damien --- org.user.private-key.secured task')
      let githubId = org.githubId
      let data = job
      return messenger.messageRoom('org', githubId, data)
    })
}
