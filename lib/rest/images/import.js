var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var images = require('middleware/images');
var containers = require('middleware/containers');
var harbourmaster = require('middleware/harbourmaster');
var query = require('middleware/query');
var votes = require('middleware/votes');
var utils = require('middleware/utils');
var async = require('async');
var express = require('express');
var Image = require('models/images');
var User = require('models/users');
var Channel = require('models/channels');
var files = require('middleware/files');
var configs = require('configs');
var nab = require('githubNabber');
var error = require('error');
var url = require('url');
var _ = require('lodash');
var app = module.exports = express();

app.post('/github',
  query.require('githubUrl', 'stack'),
  images.createFromGithub('user_id', 'query.githubUrl', 'query.stack'),
  images.model.addTag('query.stack'),
  images.model.addSelfToRevisions(),
  containers.create({
    owner: 'user_id'
  }),
  containers.model.inheritFromImage('image', {
    parent: undefined,
    importSource: 'query.githubUrl'
  }),
  utils.if(me.isRegistered,
    containers.model.set('saved', true)),
  containers.model.save(),
  harbourmaster.createContainer,
  files.sync,
  containers.respond);

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
