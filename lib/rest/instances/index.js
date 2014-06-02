'use strict';

/**
 * Project API
 * @module rest/instances
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var me = require('middleware/me');
var projects = require('middleware/projects');
var instances = require('middleware/instances');
var validations = require('middleware/validations');

var findInstance = flow.series(
  instances.findById('params.id'),
  instances.checkFound
);

/**
 * List of instances
 */
app.get('/',
  mw.res.send(501));

/**
 * Post in a instance
 */
app.post('/',
  mw.body('environment').require().validate(validations.isObjectId),
  projects.findOneBy('environments._id', 'body.environment'),
  projects.checkFound,
  projects.model.findEnvById('body.environment'),
  instances.createFromEnv(
    'userId', 'project', "project.findEnvById(body.environment)"),
  mw.res.send(201, 'instance'));

/**
 * Get in a instance
 */
app.get('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    instances.model.isPublic(),
    me.isModerator),
  mw.res.json('instance'));

/**
 * Update in a instance
 */
app.patch('/:id',
  findInstance,
  flow.or(
    me.isOwnerOf('instance'),
    me.isModerator),
  mw.body('public').require().pick(),
  instances.updateById('params.id', {
    $set: 'body'
  }),
  instances.findById('params.id'),
  mw.res.json('instance'));

/**
 * Delete in a instance
 */
app.delete('/:id',
  mw.res.send(501));