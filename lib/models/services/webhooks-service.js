/**
 * Service that processes hooks received from GitHub
 * @module lib/models/services/wehooks-service
 */

'use strict'


function WebhookService() {}

module.exports = new WebhookService()


WebhookService.prototype.handleDelete = function (repo, branch) {
  return Instance.findForkedInstancesAsync(repo, branch)
    .then(function (forkedInstances) {
      var ids = forkedInstances.map(pluck('_id'))
      ids.forEach(function (id) {
        rabbitMQ.deleteInstance({
          instanceId: id.toString()
        })
      })
      return ids
    })
}
