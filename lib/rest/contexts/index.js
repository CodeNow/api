var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');

var contexts = require('middleware/contexts');
var me = require('middleware/me');
var project = require('middleware/projects');
var utils = require('middleware/utils');

app.get('/',
  // TODO: we will probably need this...
  function (req, res) { res.send(501); });

app.post('/',
  me.isRegistered,
  // this is a little more robust, since we have to use something similar
  // in the project logic as well (checkValidContexts)
  contexts.checkValidContexts('name', 'dockerfile', 'project'),
  project.findById('body.project'),
  project.checkFound,
  contexts.create({
    owner: 'user_id',
    name: 'body.name'
  }),
  contexts.model.uploadDockerfile('body.dockerfile'),
  contexts.model.save(),
  project.addContexts,
  project.model.save(),
  contexts.respond);

app.get('/:id',
  contexts.findById('params.id'),
  contexts.checkFound,
  contexts.respond);

// build docker image for this context
app.post('/:id/build',
  contexts.findById('params.id'),
  contexts.checkFound,
  // build a new docker image
  // increment the version
  // return a success with connections to the new container?
  function (req, res) { res.send(501); });

app.del('/:id',
  contexts.findById('params.id', { _id: 1, owner: 1}),
  contexts.checkFound,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator),
  contexts.removeById('params.id'),
  utils.respondNoContent);
