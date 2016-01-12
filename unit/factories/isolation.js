'use strict'

var validation = require('../fixtures/validation')(null)

var Isolation = require('models/mongo/isolation')

module.exports = function createNewIsolation (instances) {
  if (!instances) {
    instances = []
  } else if (!Array.isArray(instances)) {
    instances = [instances]
  }

  return new Isolation({
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    instances: instances
  })
}
