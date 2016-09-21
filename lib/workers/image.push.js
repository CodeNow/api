'use strict'
require('loadenv')()
const joi = require('joi')

const Docker = require('models/apis/docker')
const logger = require('logger')

module.exports = class Worker {
  static get jobSchema () {
    return joi.object({
      imageTag: joi.string().required()
    }).unknown().required().label('image.push task')
  }

  static get maxNumRetries () {
    return 5
  }

  /**
   * @return {Promise} worker task promise
   */
  static task (job) {
    const log = logger.child({ job: job, method: 'ImagePush' })
    const docker = new Docker()
    log.info('ImagePush called')
    return docker.pushImage(job.imageTag)
  }
}
