'use strict'

const logger = require('logger').child({ module: 'audit-plugin' })
const objectId = require('objectid')

/**
 * AuditPlugin that adds support for softDelete
 */
module.exports = function auditPlugin (schema, options) {
  const NotFoundError = options.NotFoundError

  /**
   * Mark model as deleted
   * @param {ObjectId} modelId - id of the Model
   * @return {Promise}
   * @resolves {Model} updated Mongo model
   */
  schema.statics.markAsDeleted = function (modelId) {
    const log = logger.child({
      method: 'markAsDeleted',
      modelId
    })
    log.info('called')
    return this.findOneAndUpdateAsync({
      _id: objectId(modelId),
      deleted: {
        $exists: false
      }
    }, {
      $set: {
        deleted: Date.now()
      }
    }, {
      new: true
    })
  }

  /**
   * Find Model by `id` and assert that it was found
   * @param {ObjectId} modelId - id of the Model
   * @return {Promise}
   * @resolves {Model} Model
   * @rejects {Model.NotFoundError}  if active model wasn't found
   */
  schema.statics.findByIdAndAssert = function (modelId) {
    const log = logger.child({
      method: 'findByIdAndAssert',
      modelId
    })
    log.info('called')
    const _id = objectId(modelId)
    return this.findOneActive({ _id })
  }

  /**
   * Find active (not deleted) Model by `query`
   * @param {Object} query - query to find Model
   * @return {Promise}
   * @resolves {Model} Model
   * @rejects {Model.NotFoundError}  if active model wasn't found
   */
  schema.statics.findOneActive = function (query) {
    const log = logger.child({
      method: 'findOneActive',
      query
    })
    log.info('called')
    const activeQuery = Object.assign({},
      query,
      {
        deleted: {
          $exists: false
        }
      }
    )
    log.trace({ activeQuery }, 'active query')
    return this.findOneAsync(activeQuery)
      .tap(function (aic) {
        if (!aic) {
          throw new NotFoundError(query)
        }
      })
  }

  /**
   * Find all active (not deleted) Models by `query`
   * @param {Object} query - query to find Model
   * @resolves {Array[Model]} array of Mongoose models
   */
  schema.statics.findAllActive = function (query) {
    const log = logger.child({
      method: 'findAllActive',
      query
    })
    log.info('called')
    const activeQuery = Object.assign({},
      query,
      {
        deleted: {
          $exists: false
        }
      }
    )
    log.trace({ activeQuery }, 'active query')
    return this.findAsync(activeQuery)
  }
}
