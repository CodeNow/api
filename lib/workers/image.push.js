'use strict'
require('loadenv')()
const joi = require('joi')

const Docker = require('models/apis/docker')

module.exports = {
  maxNumRetries: 5,

  jobSchema: joi.object({
    dockerHostUrl: joi.string().uri({ scheme: 'http' }).required(),
    imageTag: joi.string().required()
  }).unknown().required().label('image.push task'),

  task (job) {
    const docker = new Docker(job.host)
    return docker.pushImage(job.imageTag)
  }
}
