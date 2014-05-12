'use strict';

/**
 * Project Environments API
 * @module rest/projects/environments
 */

var express = require('express');
var app = module.exports = express();

var flow = require('middleware-flow');
var me = require('middleware/me');
var project = require('middleware/projects');
var utils = require('middleware/utils');

/* *** ENVIRONMENTS *** */

/*  @returns {error} 405 - not allowed. Use rest/projects/:id instead
 *  @event GET rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.get('/:id/environments', function (req, res) { res.send(405); });

/** Create an environment on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an environment
 *  @param {object} body
 *  @param {string} body.name Proposed name of the new environment
 *  @returns {object} The {@link module:models/project project}, and new environment
 *  @event POST rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.post('/:id/environments',
  project.findById('params.id'),
  project.checkFound,
  flow.or(
    project.model.checkPublic(),
    me.isOwnerOf('project'),
    me.isModerator),
  // FIXME: add some validation of body.name
  project.model.checkEnvironmentNameConflict('body.name'),
  project.model.createEnvironment('body.name', 'user_id'),
  project.pullContexts(),
  project.copyContexts('body.name'),
  project.model.save(),
  utils.code(201),
  project.respond);

/** Update an environment on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an view
 *  @param {ObjectId} envid ID of the environment of which to update
 *  @returns {object} The {@link module:models/project project}, with updated environment
 *  @event PATCH rest/projects/:id/environment/:envid
 *  @memberof module:rest/projects/environments */
app.patch('/:id/environments/:envid',
  // FIXME
  function (req, res) { res.send(501); });

/** Delete a Project's environment
 *  @param {ObjectId} id ID of the project to fetch
 *  @param {ObjectId} envid ID of the environment to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.delete('/:id/environments/:envid',
  // FIXME
  function (req, res) { res.send(501); });

/* *** PROTECTED ROUTES *** */

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.patch('/:id/environments/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.put('/:id/environments/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.delete('/:id/environments/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event GET rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.get('/:id/environments/:envid', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event POST rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.post('/:id/environments/:envid', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.put('/:id/environments/:envid', function (req, res) { res.send(405); });
