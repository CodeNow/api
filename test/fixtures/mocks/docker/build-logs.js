var nock = require('nock');
var dockerHost = require('../../docker-host');

var buffer = new Buffer(8);
buffer[0] = 0x01;
buffer[1] = 0;
buffer[2] = 0;
buffer[3] = 0;
// Clear the size bytes
buffer[4] = 0;
buffer[5] = 0;
buffer[6] = 0;
buffer[7] = 0x53;

// This mock is currently used with docker container die event
// for an image builder container.
// The docker host information is used from the instance doccument mongo (mavis).
// Mavis get's it's docker host info from docker listener.
// Docker listener uses emits data with docker's external host

module.exports = function (failure) {
  nock(dockerHost, { allowUnmocked: true })
    .filteringPath(/\/containers\/[0-9a-f]+\/logs\?.+/,
      '/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/logs')
    .get('/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/logs')
    .reply(200,
      failure ?
      buffer.toString() +
      'failfailfail failf failfailfailfailfailfailfailfailfailfailfailfailfailfailfailfail' :
      buffer.toString() +
      'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c048080d32980521e743');

  nock(dockerHost, { allowUnmocked: true })
    .filteringPath(/\/images\/.+\/push/, '/images/repo/push')
    .post('/images/repo/push')
    .reply(200);

  nock(dockerHost, { allowUnmocked: true })
    .post('/images/push')
    .reply(200);
};