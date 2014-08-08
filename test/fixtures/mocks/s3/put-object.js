'use strict';

var nock = require('nock');
var uuid = require('uuid');
var join = require('path').join;
var isFunction = require('101/is-function');

module.exports = function (contextId, key, cb) {
  var urlPath;
  if (isFunction(key) || !key) {
    cb = key;
    urlPath = contextId;
  } else {
    urlPath = join('/runnable.context.resources.test', contextId, 'source', key);
  }
  nock('https://s3.amazonaws.com:443')
    .filteringRequestBody(function () { return '*'; })
    .put(urlPath, '*')
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    });

  if (cb) { cb(); }

};
