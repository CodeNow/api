'use strict';

var Multiparty = require('multiparty');
var Boom = require('dat-middleware').Boom;
var Batch = require('batch');
var path = require('path');
var debug = require('debug')('runnable-api:infra-code-version:middleware');

var InfraCodeVersion = require('models/mongo/infra-code-version');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');

module.exports = createMongooseMiddleware(InfraCodeVersion, {
  uploadStreamToFile: function (req, res, next) {
    var form = new Multiparty.Form();

    /* Batch is a cool little tool that pushes things onto a task list
     * and calls batch.end when it is done. Kinda like async.queue to
     * help with control flow in this situation. */
    var batch = new Batch();

    // well, if our parsing errors
    form.on('error', function (err) {
      next(err);
    });

    // protect ourselves from closing w/o the file during parsing
    form.on('close', onEnd);

    // first queued task: look for a part, and save that part as a whole file
    batch.push(function (cb) {
      form.on('part', function (part) {
        if (part.filename) {
          debug('got part named', part.filename);
          // no more error on close() now
          form.removeListener('close', onEnd);
          var savePath = path.dirname(part.filename);
          if (savePath === '.') {
            savePath = '/';
          }
          var body = {
            body: part,
            name: path.basename(part.filename),
            path: savePath,
            isDir: false
          };
          req.infraCodeVersion.createFs(body, function (err, fs) {
            // thr route expects req.fs
            req.fs = fs;
            // callback out of the batch, which if this was (it is) the only one,
            // it will end up calling batch.end();
            cb(err);
          });
        }
      });
    });

    batch.end(function (err) {
      // and we are done!
      next(err);
    });

    // our nifty error handler
    function onEnd () {
      next(Boom.badRequest('Was unable to get a file from the request.'));
    }

    // hokay... parse it!
    form.parse(req);
  }
});
