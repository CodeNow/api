/**
 * Handle `instance.deleted` evenet
 * @module lib/workers/instance.deleted
 */
'use strict'

require('loadenv')()
const Promise = require('bluebird')
const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const schemas = require('models/rabbitmq/schemas')

module.exports = {
  jobSchema: schemas.instanceChangedSchema,

  _deleteIsolation (job) {
    const instance = job.instance
    if (instance.isolated && instance.isIsolationGroupMaster) {
      return IsolationService.deleteIsolatedChildren(instance.isolated)
    }
    return Promise.resolve()
  },

  _deleteForks (job) {
    const instance = job.instance
    return InstanceService.deleteAllInstanceForks(instance)
  },

  /**
   * Handle instance.deleted. Cleanup addtional resources after instance was deleted.
   * - delete isolation if needed
   * - delete forked instances if needed
   * @param {Object} job - Job info
   * @returns {Promise}
   */
  task (job) {
    return Promise.all([
      this._deleteIsolation(job),
      this._deleteForks(job)
    ]).return(null)
  }
}
