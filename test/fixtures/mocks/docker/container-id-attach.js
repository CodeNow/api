var nock = require('nock');

module.exports = function () {
  nock('http://localhost:4243', { allowUnmocked: true })
      .filteringPath(/\/containers\/[0-9a-f]+\/attach\?.+/,
        '/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/attach')
      .post('/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/attach')
      .twice()
      .reply(200, 'Successfully built 15e17eedec196751ad15cdb1cef61f6022c19bee01b8079');
};