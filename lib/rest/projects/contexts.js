'use strict';

/**
 * Project Contexts API
 * @module rest/projects/contexts
 */

var express = require('express');
var app = module.exports = express();

var contexts = require('middleware/contexts');
var me = require('middleware/me');
var project = require('middleware/projects');

/* *** CONTEXTS *** */

/** Create a new {@link module:models/context Context} on a {@link module:models/project Project}
 *  @param {object} body
 *  @param {string} body.name Name of the context to create
 *  @param {string} body.dockerfile Contents of the Dockerfile for the Context
 *  @param {ObjectId} body.project ID of the Project to which to add the new Context
 *  @param {string} body.environment Name of the Project Environment to which to add the Context
 *  @returns {object} The new Context information (no containers)
 *  @event POST rest/projects/:id/contexts
 *  @memberof module:rest/projects/contexts */
app.post('/:id/contexts',
  me.isRegistered,
  // this is a little more robust, since we have to use something similar
  // in the project logic as well (checkValidContexts)
  contexts.checkValidContexts('name', 'dockerfile', 'project'),
  project.findById('params.id'),
  project.checkFound,
  contexts.create({
    owner: 'user_id',
    name: 'body.name'
  }),
  contexts.model.uploadDockerfile('body.dockerfile'),
  project.model.addContexts('context', 'body.environment'),
  contexts.model.save(),
  project.model.save(),
  contexts.respond);

/** Get containers for all the {@link module:models/context Contexts}
 *  on a {@link module:models/project Project}
 *  @returns {object} New containers for each context!
 *  @event POST rest/projects/:id/contexts/containers
 *  @memberof module:rest/projects/contexts */
app.post('/:id/contexts/containers', function (req, res) { res.send(501); });

/* *** PROTECTED ROUTES *** */

/*  @returns {error} 405 - not allowed. Use rest/contexts/:id instead
 *  @event GET rest/projects/:id/contexts
 *  @memberof module:rest/projects/contexts */
app.get('/:id/contexts', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/projects/:id/contexts
 *  @memberof module:rest/projects/contexts */
app.patch('/:id/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/contexts
 *  @memberof module:rest/projects/contexts */
app.put('/:id/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/projects/:id/contexts
 *  @memberof module:rest/projects/contexts */
app.delete('/:id/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/projects/:id/contexts/:contextId
 *  @memberof module:rest/projects/contexts */
app.patch('/:id/contexts/:contextId', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/projects/:id/contexts/:contextId
 *  @memberof module:rest/projects/contexts */
app.delete('/:id/contexts/:contextId', function (req, res) { res.send(501); });

/*  @returns {error} 405 - not allowed
 *  @event GET rest/projects/:id/contexts/:contextId
 *  @memberof module:rest/projects/contexts */
app.get('/:id/contexts/:contextId', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event POST rest/projects/:id/contexts/:contextId
 *  @memberof module:rest/projects/contexts */
app.post('/:id/contexts/:contextId', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/contexts/:contextId
 *  @memberof module:rest/projects/contexts */
app.put('/:id/contexts/:contextId', function (req, res) { res.send(405); });
