/**
 * @module middlewares/infra-code-version
 */
'use strict';

var Batch = require('batch');
var Boom = require('dat-middleware').Boom;
var Multiparty = require('multiparty');
var path = require('path');

var logger = require('middlewares/logger')(__filename);

module.exports = {
  uploadStreamToFile: function(req, res, next) {
    var form = new Multiparty.Form();

    /* Batch is a cool little tool that pushes things onto a task list
     * and calls batch.end when it is done. Kinda like async.queue to
     * help with control flow in this situation. */
    var batch = new Batch();

    // well, if our parsing errors
    form.on('error', function(err) {
      next(err);
    });

    // protect ourselves from closing w/o the file during parsing
    form.on('close', onEnd);

    // first queued task: look for a part, and save that part as a whole file
    batch.push(function(cb) {
      form.on('part', function(part) {
        if (part.filename) {
          logger.log.info({
            filename: part.filename
          }, 'got part');
          // no more error on close() now
          form.removeListener('close', onEnd);
          var savePath = path.dirname(part.filename);
          if (savePath === '.') {
            savePath = '/';
          }
          var body = {
            body: part, // STREAM!
            name: path.basename(part.filename),
            path: savePath,
            isDir: false
          };
          req.infraCodeVersion.createFs(body, function(err, fs) {
            // thr route expects req.fs
            req.fs = fs;
            // callback out of the batch, which if this was (it is) the only one,
            // it will end up calling batch.end();
            cb(err);
          });
        } else {
          // we don't care about this part - not a file
          part.resume();
        }
      });
    });

    batch.end(function(err) {
      // and we are done!
      next(err);
    });

    // our nifty error handler
    function onEnd() {
      next(Boom.badRequest('Was unable to get a file from the request.'));
    }

    // hokay... parse it!
    form.parse(req);
  }
};
