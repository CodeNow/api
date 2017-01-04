'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')

module.exports.jobSchema = joi.object({
  organization: joi.object({
    id: joi.number(),
    name: joi.string().required()
  }).unknown().required(),
  paymentMethodOwner: joi.object({
    email: joi.string(),
    githubId: joi.number().required()
  }).unknown().required()
}).unknown().required()

module.exports.task = (job) => {
  let githubId = job.paymentMethodOwner.githubId
  let task = 'organization.payment-method.added'
  return messenger.messageRoomHenry(githubId, task)
}
