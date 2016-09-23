'use strict'
require('loadenv')()
const joi = require('joi')

const Docker = require('models/apis/docker')
const logger = require('logger')

module.exports = {
  maxNumRetries: 5,

  jobSchema: joi.object({
    dockerHostUrl: joi.string().uri({ scheme: 'http' }).required(),
    imageTag: joi.string().required()
  }).unknown().required().label('image.push task'),

  task (job) {
    const log = logger.child({ job: job, method: 'ImagePush' })
    const docker = new Docker(job.host)
    log.info('ImagePush called')
    return docker.pushImage(job.imageTag)
  }
}
