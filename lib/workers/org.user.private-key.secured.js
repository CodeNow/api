'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  orgId: joi.number().required(),
  userId: joi.number().required()
}).unknown().required()

module.exports.task = (job) => {
  let bigPoppaId = job.orgId

  return bigPoppaClient.getOrganization(bigPoppaId)
    .then((org) => {
      let githubId = org.githubId
      let data = job
      return messenger.messageRoom('org', githubId, data)
    }).catch(function (err) {
      throw new WorkerStopError('Org not found for ' + bigPoppaId, { originalError: err })
    })
}
