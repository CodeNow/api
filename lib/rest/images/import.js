var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var images = require('middleware/images');
var query = require('middleware/query');
var votes = require('middleware/votes');

app.post('/',
  users.fetchSelf,
  users.isVerified,
  query.require('name'),
  images.writeTarGz,
  images.findDockerfile,
  images.loadDockerfile,
  images.parseDockerFile,
  images.readTempFiles,
  images.createImage,
  images.buildDockerImage,
  images.saveImage,
  votes.addVote,
  images.cleanTmpDir,
  images.returnImage);