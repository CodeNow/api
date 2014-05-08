'use strict';

/**
 * Project Environments API
 * @module rest/projects/environments
 */

var express = require('express');
var app = module.exports = express();

/* *** ENVIRONMENTS *** */

/** @returns {error} 405 - not allowed. Use rest/projects/:id instead
 *  @event GET rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.get('/', function (req, res) { res.send(405); });

/** Create an environment on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an environment
 *  @returns {object} The {@link module:models/project project}, and new environment
 *  @event POST rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.post('/',
  // FIXME
  function (req, res) { res.send(501); });

/** Update an environment on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an view
 *  @param {ObjectId} envid ID of the environment of which to update
 *  @returns {object} The {@link module:models/project project}, with updated environment
 *  @event PATCH rest/projects/:id/environment/:envid
 *  @memberof module:rest/projects/environments */
app.patch('/:envid',
  // FIXME
  function (req, res) { res.send(501); });

/** Delete a Project's environment
 *  @param {ObjectId} id ID of the project to fetch
 *  @param {ObjectId} envid ID of the environment to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.del('/:envid',
  // FIXME
  function (req, res) { res.send(501); });

/* *** PROTECTED ROUTES *** */

/** @returns {error} 405 - not allowed
 *  @event PATCH rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.patch('/', function (req, res) { res.send(405); });

/** @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.put('/', function (req, res) { res.send(405); });

/** @returns {error} 405 - not allowed
 *  @event DELETE rest/projects/:id/environments
 *  @memberof module:rest/projects/environments */
app.del('/', function (req, res) { res.send(405); });

/** @returns {error} 405 - not allowed
 *  @event GET rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.get('/:envid', function (req, res) { res.send(405); });

/** @returns {error} 405 - not allowed
 *  @event POST rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.post('/:envid', function (req, res) { res.send(405); });

/** @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/environments/:envid
 *  @memberof module:rest/projects/environments */
app.put('/:envid', function (req, res) { res.send(405); });
