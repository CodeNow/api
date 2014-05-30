'use strict';

/**
 * Context API
 * @module rest/contexts
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');
var me = require('middleware/me');

var findContext = flow.series(
  contexts.findById('params.id'),
  contexts.checkFound
);

app.get('/',
  // TODO: we will probably need this...
  function (req, res) { res.send(501); });

/** Get a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context
 *  @event GET rest/contexts/:id
 *  @memberof module:rest/contexts */
app.get('/:id',
  findContext,
  flow.or(
    contexts.model.isPublic(),
    me.isOwnerOf('context'),
    me.isModerator),
  mw.res.json('context')
);

/** Update a {@link module:models/contexts Context}
 *  @param {ObjectId} id Id of the Context to update
 *  @returns {object} The {@link module:models/contexts context}
 *  @event PATCH rest/contexts/:id
 *  @memberof module:rest/contexts */
app.patch('/:id',
  findContext,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator),
  mw.body({ or: ['name', 'public'] }).pick().require(),
  contexts.model.update({ $set: 'body' }),
  contexts.findById('params.id'),
  mw.res.json('context')
);

/** Delete a {@link module:models/context Context}
 *  @param {ObjectId} id Id of the Context to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/contexts/:id
 *  @memberof module:rest/contexts */
app.delete('/:id',
  findContext,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator),
  contexts.removeById('params.id'),
  mw.res.send(204));

/** Build a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:id/build
 *  @memberof module:rest/contexts */
app.post('/:id/build',
  findContext,
  // build a new docker image
  // increment the version
  // return a success with connections to the new container?
  function (req, res) { res.send(501); });

/*  @returns {error} 405 - not allowed
 *  @event POST rest/contexts
 *  @memberof module:rest/contexts */
app.post('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/contexts
 *  @memberof module:rest/contexts */
app.patch('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/contexts
 *  @memberof module:rest/contexts */
app.delete('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/:id', function (req, res) { res.send(405); });
