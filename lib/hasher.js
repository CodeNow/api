/**
 * Remove whitespace from a buffered file or a stream of chunks
 * to produce a hash of the file that remains constant for
 * not significant whitespace changes to Dockerfiles.
 * @module lib/hasher
 */
'use strict';

var crypto = require('crypto');
var dogstatsd = require('models/datadog');
var exists = require('101/exists');
var isFunction = require('101/is-function');
var strim = require('strim');

/**
 * hash string or stream of data to md5-hex
 * @param  {String|ReadableStream} data string or readable stream of data
 * @param  {Function} cb           callback
 */
module.exports = function hasher(data, dontReplaceWhitespace, cb) {
  var start = new Date();
  if (isFunction(dontReplaceWhitespace)) {
    cb = dontReplaceWhitespace;
    dontReplaceWhitespace = false;
  }
  var replaceWhitespace = !dontReplaceWhitespace;
  var dataIsStream = exists(data.pipe);
  var md5 = crypto.createHash('md5');
  if (dataIsStream) {
    // do the streaming stuff
    var stream = data;
    if (replaceWhitespace) {
      stream = stream.pipe(strim());
    }
    stream.on('data', function(d) {
      md5.update(d);
    });
    stream.on('end', function() {
      done(null, md5.digest('hex'));
    });
    stream.on('error', done);
    md5.on('error', done);
  } else {
    // Note: replacement order matters!
    // trim whitespace after line
    // replace blank lines (containing spaces) with '/n'
    // replace blank lines/spaces at beginning of file
    // replace blank lines/spaces at end of file
    if (replaceWhitespace) {
      data = data
        .replace(/[\s\uFEFF\xA0]+\n/g, '\n')
        .replace(/\n[\s\uFEFF\xA0]*\n/g, '\n')
        .replace(/^[\s\uFEFF\xA0]*\n/g, '')
        .replace(/[\s\uFEFF\xA0\n]*$/g, '');
    }
    var hash = md5.update(data).digest('hex');
    done(null, hash);
  }
  var calledBack = false;
  function done(err, hash) {
    if (calledBack) {
      return;
    }
    calledBack = true;
    dogstatsd.timing('api.infraCodeVersion.hashTime', new Date() - start, 1, ['length:' + data.length]);
    cb(err, hash);
  }
};
