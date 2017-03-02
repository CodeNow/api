'use strict'

require('loadenv')()
const Docker = require('models/apis/docker')
const joi = require('utils/joi')

module.exports = {
  jobSchema: joi.object({
    volume: joi.object({
      Name: joi.string().required()
    }).unknown().required()
  }).unknown().required(),

  _deleteVolumes (job) {
    const volume = job.volume
    const docker = new Docker()
    return docker.deleteInstanceVolume(volume)
  },

  /**
   * Handle container.volume.delete.
   * - delete all dangling volumes
   * @param {Object} job - Job info
   * @returns {Promise}
   */
  task (job) {
    return this._deleteVolumes(job)
  }
}
