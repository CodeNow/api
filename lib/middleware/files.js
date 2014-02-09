var p = require('path');
var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var utils = require('middleware/utils');
var series = utils.series;
var error = require('error');
var dockworker = require('models/dockworker');
var createModelMiddleware = require('./createModelMiddleware');
var volumes = require('models/volumes');
var containers = require('middleware/containers');
var Container = require('models/containers');
var body = require('middleware/body');
var multiparty = require('multiparty');

var files = module.exports = createModelMiddleware('file', {
  findContainerFileFields: function (req, res, next) {
    var fields = (req.query.content === 'true' || req.query.default === 'true') ?
      null : { 'files.content': 0 };
    containers.findById(req.params.containerId, fields)(req, res, next);
  },
  findDirById: function (dirIdKey) {
    return function (req, res, next) {
      var dirId = utils.replacePlaceholders(req, dirIdKey);
      if (!req.container) {
        throw new Error('findContainer before findFile');
      }
      req.dir = req.container.findDirById(dirId);
      next();
    };
  },
  checkDirFound: function (req, res, next) {
    if (!req.dir) {
      return next(error(404, 'dir not found'));
    }
    next();
  },
  findById: function (fileIdKey) {
    return function (req, res, next) {
      var fileId = utils.replacePlaceholders(req, fileIdKey);
      req.file = req.container.findFileById(fileId);
      next();
    };
  },
  find: function (queryKey) {
    return function (req, res, next) {
      var query = utils.replacePlaceholders(req, queryKey);
      req.files = req.container.findFiles(query);
      next();
    };
  },
  createFromBody: function (bodyKey) {
    return series(
      body.pick('name', 'path', 'content', 'dir'),
      body.setDefault('dir', false),
      body.require('name', 'path', 'dir'),
      body.unless('dir',
        body.require('content')),
      createFs
    );
    function createFs (req, res, next) {
      var body = utils.replacePlaceholders(req, bodyKey);
      if (req.dir) {
        body.path = p.join(req.dir.path, req.dir.name);
      }
      async.waterfall([
        volumes.createFs.bind(volumes, req.container, body),
        Container.findById.bind(Container, req.container._id), // get latest
        function (container, cb) {
          container.createFs(body, cb); // create fs in db
        }
      ],
      req.domain.intercept(function (file) {
        req.file = file;
        res.code = 201;
        next();
      }));
    }
  },
  createFromStream: function (req, res, next) {
    var container = req.container;
    var filepath = (req.dir) ?
      p.join(req.dir.path, req.dir.name) :
      '/';
    var filename;
    var filecontent;
    var form = new multiparty.Form();

    form.parse(req);

    form.on('part', function (part) {
      filename = part.filename; // this will probably mess up with multiple files..
      volumes.streamFile.bind(volumes, req.container, part.filename, filepath, part,
        req.domain.intercept(function () {})); // noop on purpose.. intercept just to catch errors
    });

    form.on('close', function () {
      async.waterfall([
        fetchFileContent,
        Container.findById.bind(Container, req.container._id), // get latest
        function (container, cb) {
          container.createFs({
            name: filename,
            path: filepath,
            content: filecontent,
            dir: false
          }, cb);
        }
      ], req.domain.intercept(function (file) {
        req.file = file;
        res.code = 201;
        next();
      }));
    });
    function fetchFileContent (cb) {
      if (container.checkCacheFileContent(filename)) {
        volumes.readFile(container, filename, filepath, function (err, content) {
          filecontent = content;
          cb(err);
        });
      }
      else {
        cb();
      }
    }
  },
  updateById: function (idKey, dataKey) {
    return function (req, res, next) {
      var id = utils.replacePlaceholders(req, idKey);
      var data = utils.replacePlaceholders(req, dataKey);
      var container = req.container;
      var origData = req.file.toJSON();
      async.waterfall([
        volumes.updateFile.bind(volumes, container, origData, data),
        Container.findById.bind(Container, container._id), // get latest
        function (container, cb) {
          container.updateFsById(id, data, cb);
        }
      ],
      req.domain.intercept(function (file) {
        req.file = file;
        next();
      }));
    };
  },
  remove: function (req, res, next) {
    var file = req.file;
    var byContainerId = { _id: req.container._id };
    var update = {
      $pull: {
        files: { _id: file._id }
      }
    };
    async.waterfall([
      volumes.removeFs.bind(volumes, req.container, file),
      Container.update.bind(Container, byContainerId, update)
    ],
    req.domain.intercept(function () {
      next();
    }));
  },
  sync: function (req, res, next) {
    var container = req.container;
    var ignoredFiles = req.container.files
      .filter(function (file) {
        return file.ignore;
      });
    var ignoreFilepaths = ignoredFiles
      .map(function (file) {
        return p.join(file.path, file.name);
      });
    async.waterfall([
      async.series.bind(async, {
        allFiles: volumes.readAllFiles.bind(volumes, container, ignoreFilepaths),
        container: Container.findById.bind(Container, container._id) // get latest
      }),
      function (results, cb) {
        var container = results.container;
        var existingFiles = container.files;
        // carry over ignored files, they are not returned from volume
        container.files = ignoredFiles;
        results.allFiles.forEach(function (file) {
          var existingFile = _.findWhere(existingFiles, {
            name: file.name,
            path: file.path
          });
          if (existingFile) {
            file = _.extend(existingFile, file);
          }
          container.files.push(file);
        });
        container.save(cb);
      }
    ], req.domain.intercept(function (container) {
      next();
    }));
  }
});