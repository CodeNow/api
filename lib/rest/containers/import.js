var express = require('express');
var app = module.exports = express();
var path = require('path');
var me = require('middleware/me');
var query = require('middleware/query');
var images = require('middleware/images');
var containers = require('middleware/containers');
var utils = require('middleware/utils');
var files = require('middleware/files');
var harbourmaster = require('middleware/harbourmaster');

module.exports = function (baseUrl) {
  app.post(path.join(baseUrl, '/github'),
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

  return app;
};
