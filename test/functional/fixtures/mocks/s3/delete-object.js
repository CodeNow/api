'use strict'

var nock = require('nock')
var uuid = require('uuid')
var join = require('path').join
function fixedEncodeURIComponent (str) {
  // This has been added to change any characters not allowed in URIs, but still leave the /
  return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, '%2A')
    .replace(/%2F/g, '/')
}
module.exports = function (contextId, key, cb) {
  key = fixedEncodeURIComponent(key)

  // Fixing the key to make sure it's properly uri encoded
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\?.*/, '')
    .delete(join('/runnable.context.resources.test', contextId, 'source', key))
    .reply(200, '', {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    })

  if (cb) { cb() }
}
