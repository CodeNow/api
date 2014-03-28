var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var images = require('middleware/images');
var query = require('middleware/query');
var votes = require('middleware/votes');

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
