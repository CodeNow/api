'use strict';
var crypto = require('crypto');
var dogstatsd = require('models/datadog');
var isFunction = require('101/is-function');
var exists = require('101/exists');
var last = require('101/last');
var through = require('through');
var equals = require('101/equals');
var passAny = require('101/pass-any');

/**
 * hash string or stream of data to md5-hex
 * @param  {String|ReadableStream} data string or readable stream of data
 * @param  {Function} cb           callback
 */
var syncData;
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
      stream = stream
        .pipe(replaceWhitespaceStream());
    }
    stream.on('data', function (d) {
      md5.update(d);
    });
    // stream.on('end', function () {
    //   done(null, md5.digest('hex'));
    // });
    stream.pipe(require('concat-stream')(function (data) {
      cb(null, data.toString());
    }));
    stream.on('error', done);
    md5.on('error', done);
  }
  else {
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
      syncData = data;
    }
    var hash = md5.update(data).digest('hex');
    // done(null, hash);
    cb(null, data);
  }
  var calledBack = false;
  function done(err, hash) {
    if (calledBack) { return; }
    calledBack = true;
    dogstatsd.timing('api.infraCodeVersion.hashTime', new Date()-start, 1, ['length:'+data.length]);
    cb(err, hash);
  }
};

var fullWhitespace = /^[\s\uFEFF\xA0]+$/;
var startWhitespace  = /^[\s\uFEFF\xA0\n]+/;
var endWhitespace  = /([\s\uFEFF\xA0]+)$/;
function replaceWhitespaceStream () {
  var out = '';
  var buffer = new Buffer(0);
  var trimLeadingWhitespace = true;
  return through(
    function (data) {
      if (buffer.length) {
        data = Buffer.concat([buffer, new Buffer(data)]);
        buffer = new Buffer(0);
      }
      var str = data.toString();
      str = replaceTrailingWhitespaceInLines(str);

      if (trimLeadingWhitespace){
        trimLeadingWhitespace = false;
        str = str.replace(startWhitespace, '');
        if (str.length === 0) {
          trimLeadingWhitespace = true;
        }
      }
      str = bufferTrailingWhitespace(str);
      if (str.length) {
        out += str;
        data = new Buffer(str);
        this.queue(data);
      }
    },
    function () {
      // leftover buffer is trailing whitespace so ignore it
      this.emit('end');
    }
  );
  function replaceTrailingWhitespaceInLines (str) {
    var pieces = str.split('\n');
    var lastPiece = pieces.pop();
    pieces = pieces.map(function (piece) {
      // replace trailing whitespaces (after split \n)
      // this will replace full whitespace lines and trailing whitespace before \n
      return piece.replace(endWhitespace, '');
    });
    pieces.push(lastPiece);
    var str = pieces.join('\n').replace(/[\n]{2,}/g, '\n');
    return str;
  }
  function bufferTrailingWhitespace (str) {
    var matches = str.match(endWhitespace);
    str = str.replace(endWhitespace, '');
    if (matches) {
      buffer = Buffer.concat([buffer, new Buffer(matches[0])]);
    }
    return str;
  }
}
