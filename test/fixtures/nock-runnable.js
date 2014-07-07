var nock = require('nock');

module.exports = function (cb) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  if (cb) { cb(); }
};
