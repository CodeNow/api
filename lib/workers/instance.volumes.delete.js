/**
 * Handle `instance.deleted` evenet
 * @module lib/workers/instance.deleted
 */
'use strict'

require('loadenv')()
const Docker = require('models/apis/docker')
const schemas = require('models/rabbitmq/schemas')

module.exports = {
  jobSchema: schemas.instanceVolumesDeleteSchema,

  _deleteVolumes (job) {
    const volumes = job.volumes
    return Docker.deleteInstanceVolumes(volumes)
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
