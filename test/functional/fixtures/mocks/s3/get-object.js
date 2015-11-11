'use strict'

var nock = require('nock')
var uuid = require('uuid')
var join = require('path').join
var isFunction = require('101/is-function')
function fixedEncodeURIComponent (str) {
  // This has been added to change any characters not allowed in URIs, but still leave the /
  return encodeURIComponent(str).replace(/[!'()]/g, escape).replace(/\*/g, '%2A')
    .replace(/%2F/g, '/')
}
module.exports = function (contextId, key, body, cb) {
  if (isFunction(body)) {
    cb = body
    body = ''
  }
  // Fixing the key to make sure it's properly uri encoded
  key = fixedEncodeURIComponent(key)
  nock('https://s3.amazonaws.com:443')
    .filteringPath(/\?.*/, '')
    .get(join('/runnable.context.resources.test', contextId, 'source', key))
    .reply(200, body, {
      'x-amz-id-2': uuid(),
      'x-amz-version-id': uuid(),
      'etag': uuid()
    })

  if (cb) { cb() }
}
