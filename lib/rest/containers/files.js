var express = require('express');
var app = module.exports = express();
var path = require('path');
var me = require('middleware/me');
var containers = require('middleware/containers');
var files = require('middleware/files');
var params = require('middleware/params');
var headers = require('middleware/headers');
var body = require('middleware/body');
var utils = require('middleware/utils');
var multiparty = require('multiparty');
var dockworker = require('models/dockworker');
var Readable = require('stream').Readable;
var error = require('error');

var or = utils.or;
var series = utils.series;
var ternary = utils.ternary;

module.exports = function (baseUrl) {
  var hasPermission = series(
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator),
    utils.if(params.require('fileid'), function (req, res, next) {
      req.container.files.forEach(function (file, index) {
        if (file._id.toString() === req.params.fileid) {
          req.file = file;
          req.fileIndex = index;
        }
      });
      if (!req.file) {
        next(error(404, 'file not found'));
      } else {
        next();
      }
    }));

  app.get(path.join(baseUrl, 'files'),
    hasPermission,
    files.queryFiles,
    files.respondList);

  app.post(path.join(baseUrl, 'sync'),
    hasPermission,
    files.sync);

  app.post(path.join(baseUrl, 'files'),
    hasPermission,
    or(headers.equals('content-type', 'application/json'),
      headers.contains('content-type', 'multipart\/form-data')),
    ternary(headers.equals('content-type', 'application/json'),
      series(body.require('name'),
        body.require('path'),
        ternary(body.require('dir'),
          utils.message(201, 'dir'),
          series(body.require('content'),
            utils.message(201, 'file')))),
      utils.message(201, 'form')));

  app.put(path.join(baseUrl, 'files'),
    hasPermission,
    headers.contains('content-type', 'multipart\/form-data'),
    function (req, res, next) {
      var form = new multiparty.Form();

      form.parse(req);

      form.on('part', function (part) {
        dockworker.files.put({
          path: path.join(req.container.file_root, part.filename),
          servicesToken: req.container.servicesToken
        }, part, req.domain.intercept(function () {}));
      });

      form.on('close', next);
    },
    utils.message('form'));

  app.post(path.join(baseUrl, 'files/:fileid'),
    hasPermission,
    headers.contains('content-type', 'multipart\/form-data'),
    function (req, res, next) {
      var form = new multiparty.Form();

      form.parse(req);

      form.on('part', function (part) {
        dockworker.files.post({
          path: path.join(req.container.file_root, part.filename),
          servicesToken: req.container.servicesToken
        }, part, req.domain.intercept(function () {}));
      });

      form.on('close', next);
    },
    utils.message(201, 'form'));

  app.get(path.join(baseUrl, 'files/:fileid'),
    hasPermission,
    utils.message('file'));

  var updateFile = series(hasPermission,
    or(headers.equals('content-type', 'application/json'),
      headers.contains('content-type', 'multipart\/form-data')),
    ternary(headers.equals('content-type', 'application/json'),
      series(body.requireOne('content', 'path', 'name', 'default'),
        utils.if(body.require('content'), function (req, res, next) {
          var updateCache = req.body.default != null ?
            req.body.default : req.file.default;
          if (updateCache) {
            req.file.content = req.body.content;
          }
          var rs = new Readable();
          rs.push(req.body.content);
          rs.push(null);
          dockworker.files.put({
            path: path.join(req.container.file_root, req.file.path, req.file.name),
            servicesToken: req.container.servicesToken
          }, rs, next);
        }),
        utils.if(body.require('path'), function (req, res, next) {
          dockworker.runCommand({
            command: 'mv ' +
              path.join(req.container.file_root, req.file.path, req.file.name) +
              ' ' +
              path.join(req.container.file_root, req.body.path, req.file.name),
            servicesToken: req.container.servicesToken
          }, req.domain.intercept(function () {
            req.file.path = req.body.path;
            next();
          }));
        }),
        utils.if(body.require('name'), function (req, res, next) {
          dockworker.runCommand({
            command: 'mv ' +
              path.join(req.container.file_root, req.file.path, req.file.name) +
              ' ' +
              path.join(req.container.file_root, req.file.path, req.body.name),
            servicesToken: req.container.servicesToken
          }, req.domain.intercept(function () {
            req.file.name = req.body.name;
            next();
          }));
        }),
        utils.if(body.require('default'), function (req, res, next) {
          req.file.default = req.body.default;
          if (req.body.default) {
            console.log('read file');
            next();
          } else {
            console.log('delete content');
            req.file.content = null;
            next();
          }
        }),
        containers.model.save(),
        utils.message('file updated')),
      utils.message('form')));

  app.put(path.join(baseUrl, 'files/:fileid'), updateFile);
  app.patch(path.join(baseUrl, 'files/:fileid'), updateFile);

  app.del(path.join(baseUrl, 'files/:fileid'),
    hasPermission,
    function (req, res, next) {
      dockworker.runCommand({
        command: 'rm -rf ' +
          path.join(req.container.file_root, req.file.path, req.file.name),
        servicesToken: req.container.servicesToken
      }, req.domain.intercept(function () {
        req.container.files.splice(req.fileIndex, 1);
        next();
      }));
    },
    containers.model.save(),
    utils.message('file deleted'));

  return app;
};