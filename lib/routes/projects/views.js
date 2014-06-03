'use strict';

/**
 * Project Views API
 * @module rest/projects/views
 */

var express = require('express');
var app = module.exports = express();

/* *** VIEWS *** */

/*  @returns {error} 405 - not allowed. Use rest/projects/:id instead
 *  @event GET rest/projects/:id/views
 *  @memberof module:rest/projects/views */
app.get('/:id/views', function (req, res) { res.send(405); });

/** Create an view on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an view
 *  @returns {object} The {@link module:models/project project}, and new view
 *  @event POST rest/projects/:id/views
 *  @memberof module:rest/projects/views */
app.post('/:id/views',
  // FIXME
  function (req, res) { res.send(501); });

/** Update a view on a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to which to add an view
 *  @param {ObjectId} viewid ID of the View of which to update
 *  @returns {object} The {@link module:models/project project}, with updated view
 *  @event PATCH rest/projects/:id/views/:viewid
 *  @memberof module:rest/projects/views */
app.patch('/:id/views/:viewid',
  // FIXME
  function (req, res) { res.send(501); });

/** Delete a Project's view
 *  @param {ObjectId} id ID of the project to fetch
 *  @param {ObjectId} viewid ID of the view to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/projects/:id/views/:viewid
 *  @memberof module:rest/projects/views */
app.delete('/:id/views/:viewid',
  // FIXME
  function (req, res) { res.send(501); });

/* *** PROTECTED ROUTES *** */

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/projects/:id/views
 *  @memberof module:rest/projects/views */
app.patch('/:id/views/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/views
 *  @memberof module:rest/projects/views */
app.put('/:id/views/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/projects/:id/views
 *  @memberof module:rest/projects/views */
app.delete('/:id/views/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event GET rest/projects/:id/views/:viewid
 *  @memberof module:rest/projects/views */
app.get('/:id/views/:viewid', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event POST rest/projects/:id/views/:viewid
 *  @memberof module:rest/projects/views */
app.post('/:id/views/:viewid', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id/views/:viewid
 *  @memberof module:rest/projects/views */
app.put('/:id/views/:viewid', function (req, res) { res.send(405); });
