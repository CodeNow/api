'use strict'
require('loadenv')()
const joi = require('joi')

const Docker = require('models/apis/docker')

module.exports = {
  maxNumRetries: 5,

  jobSchema: joi.object({
    dockerHostUrl: joi.string().uri({ scheme: 'http' }).required(),
    imageTag: joi.string().required()
  }).unknown().required(),

  task (job) {
    const docker = new Docker({ host: job.dockerHostUrl })
    return docker.pushImage(job.imageTag)
  }
}
