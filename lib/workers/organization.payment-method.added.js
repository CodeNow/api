'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')

module.exports.jobSchema = joi.object({
  paymentMethodOwner: joi.object({
    githubId: joi.number().required()
  }).unknown().required()
}).unknown().required()

module.exports.task = (job) => {
  let githubId = job.paymentMethodOwner.githubId
  let task = { task: 'organization.payment-method.added' }
  return messenger.messageRoom('org', githubId, task)
}
