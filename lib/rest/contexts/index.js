var express = require('express');
var app = module.exports = express();

var contexts = require('middleware/contexts');
var me = require('middleware/me');
var project = require('middleware/projects');

app.get('/',
  function (req, res, next) { res.send(501); });

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
  contexts.respond);

// build docker images for an entire project
app.post('/:id/build',
  contexts.findById('params.id'),
  // build a new docker image
  // increment the version
  // return a success with connections to the new container?
  function (req, res, next) { res.send(501); });
