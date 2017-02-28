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
    volumes: joi.array().required()
  }).unknown().required(),

  _deleteVolumes (job) {
    const volumes = job.volumes
    return InstanceService.deleteInstanceVolumes(volumes)
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
