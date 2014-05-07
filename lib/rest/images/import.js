var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var images = require('middleware/images');
var query = require('middleware/query');
var votes = require('middleware/votes');
var docklet = require('middleware/docklet');
var error = require('error');
var Dockerode = require('dockerode');
var keypather = require('keypather')();

var fs = require('fs');
var fstream = require('fstream');
var os = require('os');
var uuid = require('node-uuid');
var rimraf = require('rimraf');
var tar = require('tar');
var zlib = require('zlib');
var async = require('async');
var request = require('request');
var configs = require('configs');
var util = require('middleware/utils');

app.post('/',
  me.isRegistered,
  query.require('name'),
  images.findConflict({
    name: 'query.name'
  }),
  writeTarGz,
  findDockerfile,
  loadDockerfile,
  parseDockerFile,
  // TODO query.pick
  images.create('query'),
  readTempFiles,
  docklet.create(),
  docklet.model.findDock(),
  buildDockerImage('dockletResult', 'image'),
  images.model.set({ owner: 'user_id' }),
  images.model.save(),
  votes.meVoteOn('image'),
  cleanTmpDir,
  images.respond);

function writeTarGz (req, res, next) {
  req.tmpdir = '' + os.tmpdir() + '/' + uuid.v4();
  fs.mkdir(req.tmpdir, req.domain.intercept(function () {
    req
      .pipe(zlib.createUnzip())
      .pipe(tar.Parse())
      .pipe(fstream.Writer({ path: req.tmpdir }))
        .on('close', next);
  }));
}
function findDockerfile (req, res, next) {
  fs.exists(req.tmpdir + '/Dockerfile', function (exists) {
    if (exists) {
      req.dockerdir = req.tmpdir;
      next();
    } else {
      fs.readdir(req.tmpdir, req.domain.intercept(function (files) {
        req.dockerdir = req.tmpdir + '/' + files[0];
        fs.exists(req.dockerdir + '/Dockerfile', function (exists) {
          if (!exists) {
            next(error(400, 'could not find Dockerfile'));
          } else {
            next();
          }
        });
      }));
    }
  });
}
function loadDockerfile (req, res, next) {
  fs.readFile(req.dockerdir + '/Dockerfile', 'utf8', req.domain.intercept(function (dockerfile) {
    req.dockerfile = dockerfile;
    next();
  }));
}
function parseDockerFile (req, res, next) {
  req.cmd = /^CMD\s+(.+)$/m.exec(req.dockerfile);
  if (req.cmd == null) {
    return next(error(400, 'Dockerfile needs CMD'));
  }
  req.cmd = req.cmd.pop();
  try {
    req.cmd = JSON.parse(req.cmd).join(' ');
  } catch (e) {}
  req.workdir = /^WORKDIR\s+(.+)$/m.exec(req.dockerfile);
  if (req.workdir == null) {
    return next(error(400, 'Dockerfile needs WORKDIR'));
  }
  req.workdir = req.workdir.pop();
  next();
}
function readTempFiles (req, res, next) {
  // for now just covering our test usecase
  fs.readdir(req.dockerdir + '/src', req.domain.intercept(function (filenames) {
    async.map(filenames, function readFile (filename, cb) {
      fs.readFile(req.dockerdir + '/src/' + filename, 'utf8',
        req.domain.intercept(function (file) {
          cb(null, {
            name: filename,
            path: '/',
            dir: false,
            default: true,
            content: file,
            ignore: false
          });
        }));
    }, req.domain.intercept(function (files) {
      req.image.files = files;
      next();
    }));
  }));
}
function buildDockerImage (dockIpKey, imageKey) {
  return function (req, res, next) {
    var dockIp = keypather.get(req, dockIpKey);
    var image = keypather.get(req, imageKey);
    var docker = new Dockerode({
      host: 'http://'+dockIp,
      port: 4243
    });
    var tarred = fstream.Reader({
      path: req.dockerdir + '/',
      type: 'Directory',
      mode: '0755'
    }).pipe(tar.Pack({ fromBase: true }))
      .pipe(new require('stream').PassThrough());

    var tag = image.getRepo();
    docker.buildImage(tarred, { t: tag }, function (err, stream) {
      if (err) {
        console.log('err', err);
        next(err);
      }
      else {
        stream.on('error', onError);
        stream.on('data', onData);
        stream.on('end', onEnd);
      }
      var errored = false;
      function onError (err) {
        errored = err;
        next(err);
      }
      var buffer = '';
      function onData (data) {
        if (errored) { return; }
        try {
          buffer += data;
          JSON.parse(buffer);
          buffer = ''; // reset buffer if data was json
          if (data.error) {
            var errorDetail = data.errorDetail;
            onError(error(502, errorDetail.code+': '+errorDetail.message+' '+data.error));
          }
        }
        catch (err) {
          // recieved partial json..
        }
      }
      function onEnd () {
        if (errored) { return; }
        next();
      }
    });
  };
}
function cleanTmpDir (req, res, next) {
  rimraf(req.tmpdir, next);
}