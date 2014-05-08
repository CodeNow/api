'use strict';

/**
 * Context API
 * @module rest/contexts
 */

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

/** Create a new {@link module:models/context Context} on a {@link module:models/project Project}
 *  @param {object} body
 *  @param {string} body.name Name of the context to create
 *  @param {string} body.dockerfile Contents of the Dockerfile for the Context
 *  @param {ObjectId} body.project ID of the Project to which to add the new Context
 *  @param {string} body.environment Name of the Project Environment to which to add the Context
 *  @returns {object} The new Context information (no containers)
 *  @event POST rest/contexts/
 *  @memberof module:rest/contexts */
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
  project.model.addContexts('context', 'body.environment'),
  contexts.model.save(),
  project.model.save(),
  contexts.respond);

/** @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/', function (req, res) { res.send(405); });
/** @returns {error} 405 - not allowed
 *  @event PATCH rest/contexts
 *  @memberof module:rest/contexts */
app.patch('/', function (req, res) { res.send(405); });
/** @returns {error} 405 - not allowed
 *  @event DELETE rest/contexts
 *  @memberof module:rest/contexts */
app.del('/', function (req, res) { res.send(405); });

/** Get a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context
 *  @event GET rest/contexts/:id
 *  @memberof module:rest/contexts */
app.get('/:id',
  contexts.findById('params.id'),
  contexts.checkFound,
  contexts.respond);

/** Update a {@link module:models/contexts Context}
 *  @param {ObjectId} id Id of the Context to update
 *  @returns {object} The {@link module:models/contexts context}
 *  @event PATCH rest/contexts/:id
 *  @memberof module:rest/contexts */
app.patch('/:id',
  // FIXME
  function (req, res) { res.send(501); });

/** Delete a {@link module:models/context Context}
 *  @param {ObjectId} id Id of the Context to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/contexts/:id
 *  @memberof module:rest/contexts */
app.del('/:id',
  contexts.findById('params.id', { _id: 1, owner: 1}),
  contexts.checkFound,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator),
  contexts.removeById('params.id'),
  utils.respondNoContent);

/** @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/:id', function (req, res) { res.send(405); });

/** Build a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:id/build
 *  @memberof module:rest/contexts */
app.post('/:id/build',
  contexts.findById('params.id'),
  contexts.checkFound,
  // build a new docker image
  // increment the version
  // return a success with connections to the new container?
  function (req, res) { res.send(501); });
