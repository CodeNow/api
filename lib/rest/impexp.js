var async = require('async');
var express = require('express');
var fs = require('fs');
var fstream = require('fstream');
var mkdirp = require('mkdirp');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var rimraf = require('rimraf');
var runnables = require('../models/runnables');
var tar = require('tar');
var zlib = require('zlib');
var app = module.exports = express();
app.post('/runnables/import', function (req, res) {
  req.pause();
  var tmpdir = '' + os.tmpdir() + '/' + uuid.v4();
  fs.mkdirSync(tmpdir);
  var writer = fstream.Writer({ path: tmpdir });
  var sync = req.query.sync !== 'false';
  writer.on('close', function () {
    fs.exists('' + tmpdir + '/runnable.json', function (exists) {
      if (exists) {
        runnables.createImageFromDisk(req.domain, req.user_id, tmpdir, sync, req.domain.intercept(function (runnable) {
          rimraf(tmpdir, req.domain.intercept(function () {
            res.json(201, runnable);
          }));
        }));
      } else {
        fs.readdir(tmpdir, req.domain.intercept(function (files) {
          var newPath = '' + tmpdir + '/' + files[0];
          fs.exists('' + newPath + '/runnable.json', function (exists) {
            if (!exists) {
              res.json(403, { message: 'could not find runnable.json' });
            } else {
              runnables.createImageFromDisk(req.domain, req.user_id, newPath, sync, req.domain.intercept(function (runnable) {
                rimraf(tmpdir, req.domain.intercept(function () {
                  res.json(201, runnable);
                }));
              }));
            }
          });
        }));
      }
    });
  });
  req
    .pipe(zlib.createUnzip())
    .pipe(tar.Parse())
    .pipe(writer);
  req.resume();
});
app.get('/runnables/:id/export', function (req, res) {
  var baseTmpDir = '' + os.tmpdir() + '/' + uuid.v4();
  fs.mkdirSync(baseTmpDir);
  var tmpdir = '' + baseTmpDir + '/' + req.params.id;
  fs.mkdirSync(tmpdir);
  runnables.getImage(req.domain, req.params.id, req.domain.intercept(function (runnable) {
    var runnable_json = {
      name: runnable.name,
      image: runnable.image,
      cmd: runnable.start_cmd,
      port: runnable.port,
      start_cmd: runnable.start_cmd,
      build_cmd: runnable.build_cmd,
      service_cmds: runnable.service_cmds,
      description: runnable.description,
      file_root: runnable.file_root,
      file_root_host: runnable.file_root_host
    };
    runnable_json.tags = [];
    runnable.tags.forEach(function (tag) {
      runnable_json.tags.push({ name: tag.name });
    });
    fs.writeFile('' + tmpdir + '/Dockerfile', runnable.dockerfile, 'utf8', req.domain.intercept(function () {
      fs.mkdir('' + tmpdir + '/' + runnable.file_root_host, req.domain.intercept(function () {
        runnables.createContainer(req.domain, req.user_id, req.params.id, req.domain.intercept(function (container) {
          runnables.listFiles(req.domain, req.user_id, container._id, true, void 0, void 0, void 0, req.domain.intercept(function (files) {
            runnable_json.files = [];
            async.forEach(files, function (file, cb) {
              if (file.ignore || file['default']) {
                file.ignore = file.ignore || false;
                file.dir = file.dir || false;
                file['default'] = file['default'] || false;
                runnable_json.files.push({
                  name: file.name,
                  path: file.path,
                  ignore: file.ignore,
                  'default': file['default'],
                  dir: file.dir
                });
              }
              mkdirp('' + tmpdir + '/' + runnable.file_root_host + file.path, req.domain.intercept(function () {
                if (file.ignore) {
                  cb();
                } else if (file.dir) {
                  fs.mkdir('' + tmpdir + '/' + runnable.file_root_host + file.path + '/' + file.name, req.domain.intercept(function () {
                    cb();
                  }));
                } else {
                  fs.writeFile('' + tmpdir + '/' + runnable.file_root_host + file.path + '/' + file.name, file.content, 'utf8', req.domain.intercept(function () {
                    return cb();
                  }));
                }
              }));
            }, req.domain.intercept(function () {
              fs.writeFile('' + tmpdir + '/runnable.json', JSON.stringify(runnable_json, void 0, 2), 'utf8', req.domain.intercept(function () {
                runnables.removeContainer(req.domain, req.user_id, container._id, req.domain.intercept(function () {
                  var tmpdir = path.resolve(tmpdir);
                  var reader = fstream.Reader({
                    path: tmpdir,
                    type: 'Directory',
                    mode: '0755'
                  });
                  reader.pause();
                  res.set('content-type', 'application/x-gzip');
                  res.on('end', function () {
                    rimraf(baseTmpDir, req.domain.intercept(function () {}));
                  });
                  reader
                    .pipe(tar.Pack())
                    .pipe(zlib.createGzip())
                    .pipe(res);
                  reader.resume();
                }));
              }));
            }));
          }));
        }));
      }));
    }));
  }));
});