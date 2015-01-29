'use strict';
var crypto = require('crypto');
var dogstatsd = require('models/datadog');
var hashStream = require('hash-stream');
var replaceStream = require('replace-stream');
var isFunction = require('101/is-function');
var exists = require('101/exists');
/**
 * hash string or stream of data to md5-hex
 * @param  {String|ReadableStream} data string or readable stream of data
 * @param  {Function} cb           callback
 */
module.exports = function hasher(data, replaceWhitespace, cb) {
  var start = new Date();
  if (isFunction(replaceWhitespace)) {
    cb = replaceWhitespace;
    replaceWhitespace = false;
  }
  var dataIsStream = exists(data.pipe);
  if (dataIsStream) {
    // do the streaming stuff
    var stream = data;
    if (replaceWhitespace) {
      // Note: replacement order matters!
      // trim whitespace after line
      // replace blank lines (containing spaces) with '/n'
      // replace blank lines/spaces at beginning of file
      // replace blank lines/spaces at end of file
      stream = stream
        .pipe(replaceStream(/[\s\uFEFF\xA0]+\n/g,   '\n'))
        .pipe(replaceStream(/\n[\s\uFEFF\xA0]*\n/g, '\n'))
        .pipe(replaceStream(/^[\s\uFEFF\xA0]*\n/g,  ''))
        .pipe(replaceStream(/[\s\uFEFF\xA0\n]*$/g,  ''));
    }
    hashStream(stream, 'md5', function (err, hash) {
      if (err) { return done(err); }
      done(null, hash.toString('hex'));
    });
  }
  else {
    var md5 = crypto.createHash('md5');
    // Note: replacement order matters!
    // trim whitespace after line
    // replace blank lines (containing spaces) with '/n'
    // replace blank lines/spaces at beginning of file
    // replace blank lines/spaces at end of file
    if (replaceWhitespace) {
      data = data
        .replace(/[\s\uFEFF\xA0]+\n/g,   '\n')
        .replace(/\n[\s\uFEFF\xA0]*\n/g, '\n')
        .replace(/^[\s\uFEFF\xA0]*\n/g,  '')
        .replace(/[\s\uFEFF\xA0\n]*$/g,  '');
    }
    var hash = md5.update(data, 'utf8').digest('hex');
    done(null, hash);
  }
  function done(err, hash) {
    dogstatsd.timing('api.infraCodeVersion.hashTime', new Date()-start, 1, ['length:'+data.length]);
    cb(err, hash);
  }
};