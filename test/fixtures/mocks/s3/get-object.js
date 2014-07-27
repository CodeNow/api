'use strict';

var nock = require('nock');
var uuid = require('uuid');
var join = require('path').join;
var isFunction = require('101/is-function');

module.exports = function (contextId, key, body, cb) {
  if (isFunction(body)) {
    cb = body;
    body = '';
  }
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\?.*/, '')
    .get(join('/runnable.context.resources.test', contextId, 'source', key))
    .reply(200, body, {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  if (cb) { cb(); }

};
