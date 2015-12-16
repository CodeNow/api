var nock = require('nock')
var noop = require('101/noop')

module.exports = function (done) {
  done = done || noop
  nock.cleanAll()
  done()
}
