'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

module.exports.jobSchema = joi.object({
  invoice: joi.object({
    id: joi.string().required()
  }).required(),
  organization: joi.object({
    id: joi.number().required()
  }).required()
}).unknown().required()

module.exports.task = (job) => {
  let orgId = job.organization.id.toString()
  let task = 'organization.invoice.pay'
  return bigPoppaClient.getOrganization(orgId)
    .then((org) => {
      let githubId = org.githubId
      let data = {task: task}
      return messenger.messageRoom('org', githubId, data)
    })
}
