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
var validations = require('middlewares/validations');
var checkFound = require('middlewares/check-found');

var findContext = flow.series(
  contexts.findById('params.id'),
  checkFound('context'));

/*  List {@link module:models/context Contexts}
 *  @event GET rest/contexts
 *  @memberof module:rest/contexts */
app.get('/contexts/',
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
app.get('/contexts/:id',
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
app.patch('/contexts/:id',
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
app.delete('/contexts/:id',
  findContext,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator),
  contexts.removeById('params.id'),
  mw.res.send(204));

/*  @returns {error} 405 - not allowed
 *  @event POST rest/contexts
 *  @param {object} body
 *  @param {string} body.name Name of the context to create
 *  @param {string} [body.owner] Owner of the context to create (an org the user may belong to)
 *  @memberof module:rest/contexts */
app.post('/contexts/',
  mw.body('name').require().string(),
  mw.body('name', 'owner', 'isSource').pick(),
  mw.body('owner').require().then(mw.body('owner').validate(validations.isObject)),
  mw.body('owner.github').require()
    .then(mw.body('owner.github').number())
    .else(mw.body().set('owner.github', 'sessionUser.accounts.github.id')),
  mw.body('isSource').require()
    .then(me.isModerator) // Only Moderators should be able to create Source Contexts
    .else(flow.or(
      me.isOwnerOf('body'),
      me.isModerator)),
  contexts.createBy('body'),
  contexts.model.save(),
  mw.res.send(201, 'context'));

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/contexts
 *  @memberof module:rest/contexts */
app.patch('/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/contexts
 *  @memberof module:rest/contexts */
app.delete('/contexts/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/contexts
 *  @memberof module:rest/contexts */
app.put('/contexts/:id', function (req, res) { res.send(405); });
