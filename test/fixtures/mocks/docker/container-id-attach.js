var nock = require('nock');

module.exports = function () {
  nock('http://localhost:4243', { allowUnmocked: true })
    .filteringPath(/\/images\/.+\/push/, '/images/repo/push')
    .post('/images/repo/push')
    .reply(200);

  nock('http://localhost:4243', { allowUnmocked: true })
    .post('/images/push')
    .reply(200);
};