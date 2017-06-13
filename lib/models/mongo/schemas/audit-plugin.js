'use strict'

const validators = require('models/mongo/schemas/schema-validators').commonValidators

module.exports = function auditPlugin (schema, options) {
  schema.add({
    created: {
      type: Date,
      'default': Date.now,
      validate: validators.beforeNow({ model: options.modelName, literal: 'created' })
    }
  })
  schema.add({
    deleted: {
      type: Date,
      validate: validators.beforeNow({ model: options.modelName, literal: 'deleted' })
    }
  })
  // big poppa user id
  schema.add({
    createdByUser: {
      type: Number
    }
  })
  // big poppa org id
  schema.add({
    ownedByOrg: {
      type: Number
    }
  })
}
