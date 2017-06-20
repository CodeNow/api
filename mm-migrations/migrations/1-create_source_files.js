'use strict'

module.exports.id = 'CREATE_SOURCE_FILES'

const seedVersions = require('../../scripts/seed-version').seedVersions

module.exports.up = function (done) {
  // use this.db for MongoDB communication, and this.log() for logging
  seedVersions()
    .asCallback(done)
}

module.exports.down = function (done) {
  // use this.db for MongoDB communication, and this.log() for logging
  done()
}
