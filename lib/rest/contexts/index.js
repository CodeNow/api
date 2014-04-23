var express = require('express');
var app = module.exports = express();
var body = require('middleware/body');
var contexts = require('middleware/contexts');
var me = require('middleware/me');

var Context = require('models/contexts');

app.get('/',
  function (req, res, next) { res.send(501); });

app.get('/:id',
  contexts.findById('params.id'),
  contexts.respond);

app.post('/',
  me.isRegistered,
  body.require('name', 'dockerfile'),
  contexts.create({
    owner: 'user_id',
    name: 'body.name'
  }),
  contexts.model.uploadDockerfile('body.dockerfile'),
  contexts.model.save(),
  contexts.respond);
