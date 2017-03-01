/**
 * Handle `instance.deleted` evenet
 * @module lib/workers/instance.deleted
 */
'use strict'

require('loadenv')()
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')

module.exports = {
  jobSchema: joi.object({
    volume: joi.object().required()
  }).unknown().required(),

  _deleteVolumes (job) {
    const volume = job.volume
    return InstanceService.deleteInstanceVolumes(volume)
      .catch((err) => {
        throw err
      })
  },

  /**
   * Handle container.volume.deleted.
   * - delete all dangling volumes
   * @param {Object} job - Job info
   * @returns {Promise}
   */
  task (job) {
    return this._deleteVolumes(job)
  }
}
