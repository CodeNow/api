var async = require('async');
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
var images = module.exports = {
  checkNameConflict: function (req, res, next) {
    if (typeof req.query.name !== 'string') {
      return next(error(400, 'name query parameter required'));
    }
    Image.findOne({ name: req.query.name }, domain.intercept(function (existing) {
      if (existing) {
        cb(error(409, 'a runnable by that name already exists'));
      } else {
        next();
      }
    }));
  },
  writeTarGz: function (req, res, next) {
    req.tmpdir = '' + os.tmpdir() + '/' + uuid.v4();
    fs.mkdir(req.tmpdir, req.domain.intercept(function () {
      req
        .pipe(zlib.createUnzip())
        .pipe(tar.Parse())
        .pipe(fstream.Writer({ path: req.tmpdir }))
          .on('close', next);
    }));
  },
  findDockerfile: function (req, res, next) {
    fs.exists(req.tmpdir + '/Dockerfile', function (exists) {
      if (exists) {
        req.dockerdir = req.tmpdir;
        next();
      } else {
        fs.readdir(req.tmpdir, req.domain.intercept(function (files) {
          req.dockerdir = req.tmpdir + '/' + files[0];
          fs.exists(req.dockerdir + '/Dockerfile', function (exists) {
            if (!exists) {
              res.json(400, { message: 'could not find Dockerfile' });
            } else {
              next();
            }
          });
        }));
      }
    });
  },
  loadDockerfile: function (req, res, next) {
    fs.readFile(req.dockerdir + '/Dockerfile', 'utf8', req.domain.intercept(function (dockerfile) {
      req.dockerfile = dockerfile;
      next();
    }));
  },
  parseDockerFile: function (req, res, next) {
    req.cmd = /^CMD\s+(.+)\s+?$/m.exec(req.dockerfile);
    if (req.cmd == null) {
      return next(error(400, 'Dockerfile needs CMD'));
    }
    req.cmd = req.cmd.pop();
    try {
      req.cmd = JSON.parse(req.cmd).join(' ');
    } catch (e) {}
    req.workdir = /^WORKDIR\s+(.+)\s+?$/m.exec(req.dockerfile);
    if (req.workdir == null) {
      return next(error(400, 'Dockerfile needs WORKDIR'));
    }
    next();
  },
  createImage: function (req, res, next) {
    req.image = new Image({
      owner: req.self._id
    });
    next();
  },
  buildDockerImage = function (req, res, next) {
    fstream.Reader({
      path: req.dockerdir,
      type: 'Directory',
      mode: '0755'
    }).pipe(tar.Pack())
      .pipe(zlib.createGzip())
      .pipe(request.post({
        url: configs.harbourmaster + '/build',
        headers: { 'content-type': 'application/x-gzip' },
        qs: { t: configs.dockerRegistry + '/runnable/' + req.image._id.toString() },
        pool: false
      }, domain.intercept(function (resp, body) {
        if (resp.statusCode !== 200) {
          next(error(resp.statusCode, body));
        } else if (body.indexOf('Successfully built') === -1) {
          next(error(400, 'could not build image from dockerfile'));
        } else {
          next();
        }
      })));
  },
  
  createFromDisk = function (req, res, next) {
    buildDockerImage(domain, runnablePath, tag, domain.intercept(function () {
      _.extend(image, runnable, {
        owner: owner,
        dockerfile: dockerfile
      });
      console.log('build');
      runnable.tags = runnable.tags || [];
      var _ref = runnable.files;
      for (var _i = 0, _len = _ref.length; _i < _len; _i++) {
        var file = _ref[_i];
        image.files.push(file);
      }
      if (sync && false) {
        syncDockerImage(domain, image, domain.intercept(function () {
          console.log('sync');
          image.synced = true;
          image.save(domain.intercept(function () {
            cb(null, image, runnable.tags);
          }));
        }));
      } else {
        image.save(domain.intercept(function () {
          cb(null, image, runnable.tags);
        }));
      }
    }));
  },
  createImageFromDisk: function (req, res, next) {
    images.createFromDisk(domain, userId, runnablePath, sync, domain.intercept(function (image, tags) {
      async.forEach(tags, function (tag, cb) {
        channels.findOne({ aliases: tag.toLowerCase() }, domain.intercept(function (channel) {
          if (channel) {
            image.tags.push({ channel: channel._id });
            cb();
          } else {
            channels.createImplicitChannel(domain, tag, domain.intercept(function (channel) {
              image.tags.push({ channel: channel._id });
              cb();
            }));
          }
        }));
      }, domain.intercept(function () {
        image.save(domain.intercept(function () {
          users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
            if (!user) {
              cb(error(404, 'user not found'));
            } else {
              user.addVote(domain, image._id, domain.intercept(function () {
                var json_image = image.toJSON();
                delete json_image.files;
                if (json_image.parent) {
                  json_image.parent = encodeId(json_image.parent);
                }
                json_image._id = encodeId(image._id);
                cb(null, json_image);
                caching.markCacheAsDirty();
              }));
            }
          }));
        }));
      }));
    }));
  },
  cleanTmpDir: function (req, res, next) {
    rimraf(req.tmpdir, next);
  },
  returnUser: function (req, res) {
    var json_image = req.image.toJSON();
    res.json(res.code || 200, json_image);
  }
};