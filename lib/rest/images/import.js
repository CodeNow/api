var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
var images = require('middleware/images');
var query = require('middleware/query');
var votes = require('middleware/votes');
var utils = require('middleware/utils');

var async = require('async');
var express = require('express');
var fs = require('fs');
var fstream = require('fstream');
var mkdirp = require('mkdirp');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var rimraf = require('rimraf');
var tar = require('tar');
var Image = require('models/images');
var User = require('models/users');
var configs = require('configs');
var nab = require('githubNabber');
var error = require('error');
var url = require('url');
var app = module.exports = express();

app.post('/github', 
  me.isRegistered,
  query.require('githubUrl', 'stack'),
  function (req, res) {
    var image = new Image();
    image.owner = req.user_id;
    image.name = 'github import ' + req.query.githubUrl;
    image.port = 80;
    async.series([
      function build (cb) {
        var harbour = url.parse(configs.harbourmaster);
        nab({
          source: req.query.githubUrl,
          host: harbour.protocol + '//' + harbour.hostname,
          port: harbour.port,
          stack: req.query.stack,
          query: {
            t: configs.dockerRegistry + '/runnable/' + image._id.toString()
          },
          verbose: false
        }, req.domain.intercept(function (properties) {
          image.start_cmd = image.cmd = properties.cmd;
          image.file_root = properties.workdir;
          if (properties.readme) {
            image.files.push({
              name: properties.readme.name,
              path: '/',
              dir: false,
              default: true,
              content: properties.readme.content,
              ignore: false
            });
          }
          image.service_cmds = properties.services;
          cb();
        }));
      },
      function save (cb) {
        image.revisions.push({
          repo: image._id.toString()
        });
        image.save(cb);
      },
      function vote (cb) {
        User.findById(req.user_id, req.domain.intercept(function (user) {
          if (!user) {
            cb(error(404, 'user not found'));
          } else {
            user.voteOn(image, cb);
          }
        }));
      }
    ], req.domain.intercept(function () {
      var json_image = image.toJSON();
      delete json_image.files;
      if (json_image.parent) {
        json_image.parent = utils.encodeId(json_image.parent);
      }
      json_image._id = utils.encodeId(image._id);
      res.json(201, json_image);
    }));
});

app.post('/',
  me.isRegistered,
  query.require('name'),
  images.findConflict({
    name: 'query.name'
  }),
  images.writeTarGz,
  images.findDockerfile,
  images.loadDockerfile,
  images.parseDockerFile,
  // TODO query.pick
  images.create('query'),
  images.readTempFiles,
  images.buildDockerImage,
  images.model.set({ owner: 'user_id' }),
  images.model.save(),
  votes.meVoteOn('image'),
  images.cleanTmpDir,
  images.respond);