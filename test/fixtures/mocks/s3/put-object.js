'use strict';

var nock = require('nock');
var uuid = require('uuid');
var join = require('path').join;

module.exports = function (contextId, key, cb) {
  nock('https://s3.amazonaws.com:443')
    .filteringRequestBody(function () { return '*'; })
    .put(join('/runnable.context.resources.test', contextId, 'source', key), '*')
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  if (cb) { cb(); }

};
