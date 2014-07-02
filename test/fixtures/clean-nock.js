var nock = require('nock');

module.exports = function (done) {
  nock.cleanAll();
  done();
};