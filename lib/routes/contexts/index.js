'use strict';

/**
 * Context API
 * @module rest/contexts
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var contexts = require('middlewares/mongo').contexts;
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');

var findContext = flow.series(
  contexts.findById('params.id'),
  checkFound('context'));

/*  List {@link module:models/context Contexts}
 *  @event GET rest/contexts
 *  @memberof module:rest/contexts */
app.get('/',
  // TODO: we will probably need this...
  // TODO: What is this supposed to do?  Should it list all of the contexts owned by the user?
  // All contexts that the user (or is part of a group that) owns or moderates, or is Public?
  mw.query('isSource').pick().require(),
  contexts.find('query'),
  checkFound('contexts'),
  mw.res.json('contexts'));

/** Get a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context
 *  @event GET rest/contexts/:id
 *  @memberof module:rest/contexts */
app.get('/:id',
  findContext,
  flow.or(
    me.isOwnerOf('context'),
    contexts.model.isPublic(),
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
  // FIXME: do not allow source edits
  mw.body({ or: ['name', 'public', 'source'] }).pick().require(),
  mw.body('source').require().then(mw.log('WARNING: PATCHING SOURCE')),
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

/*  @returns {error} 405 - not allowed
 *  @event POST rest/contexts
 *  @memberof module:rest/contexts */
app.post('/',
  mw.body('name').require(),
  // FIXME: only allow moderators to create source contexts
  mw.body('name', 'owner', 'isSource').pick(),
  contexts.createBy('sessionUser', 'body'),
  contexts.model.save(),
  mw.res.send(201, 'context'));

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
