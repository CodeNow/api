'use strict';

/**
 * Project API
 * @module rest/projects
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var Boom = mw.Boom;

var me = require('middlewares/me');
var mongoMiddlewares = require('middlewares/mongo');
var projects = mongoMiddlewares.projects;
var users = mongoMiddlewares.users;
var utils = require('middlewares/utils');
var validations = require('middlewares/validations');
var checkFound = require('middlewares/check-found');
var transformations = require('middlewares/transformations');

var findProject = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
    projects.findById('params.id', {}),
    checkFound('project'));

/** List {@link module:models/project Project}
 *  @param {object} [query] Query with parameters
 *  @returns {Array.object} The projects
 *  @event GET rest/projects
 *  @memberof module:rest/projects */
app.get('/',
  mw.query('search', 'owner', 'name', 'githubUsername', 'sort', 'page', 'limit').pick(),
  mw.query({ or: ['owner', 'name', 'githubUsername', 'search', 'sort'] }).require(),
  mw.query('githubUsername').require()
    .then(
      users.findOneByGithubUsername(
        'query.githubUsername',
        'sessionUser.accounts.github.accessToken'),
      checkFound('user'),
      mw.query().set('owner.github', 'user.accounts.github.id'),
      mw.query().unset('githubUsername')),
  mw.query('owner').require()
    .then(
      mw.query('owner').object(),
      mw.query('owner.github').require(),
      function (req, res, next) {
        req.query.owner.github = transformations.toInt(req.query.owner.github);
        if (Number.isNaN(req.query.owner.github)) {
          next(Boom.badRequest('owner.github must be a number'));
        } else {
          next();
        }
      }),
  mw.query('search').require()
    .then(
      projects.search('query.search'),
      projects.respond),
  utils.formatPaging(),
  mw.query('sort').require()
    .then(mw.query('sort').validate(validations.validQuerySortParams)),
  projects.findPage('query'),
  projects.respond);

/** Create a {@link module:models/project Project}
 *  @param {object} body
 *  @param {string} body.name Name of the project to create
 *  @param {string} [body.description] Description of the project to create
 *  @param {string} [body.owner] Owner of the project to create (an org the user may belong to)
 *  @event POST rest/projects
 *  @memberof module:rest/projects */
app.post('/',
  mw.body('name', 'description', 'owner').pick(),
  mw.body('name').require(),
  // FIXME: if owner then find owner, verify user is owner or in group
  mw.body('owner.github').require()
    .then(
      mw.body('owner.github').number(),
      flow.or(
        me.isOwnerOf('project'),
        me.isModerator)
    )
    .else(mw.body().set('owner.github', 'sessionUser.accounts.github.id')),
  projects.create('body'),
  projects.model.set({ 'public': false }),
  projects.model.pushEnvironment({
    name: 'master',
    owner: 'body.owner'
  }),
  projects.model.save(),
  mw.res.json(201, 'project.toJSON()')
);

/* Get a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the project to fetch
 *  @returns {object} The {@link module:models/project project}.
 *    What did you expect, a puppy?
 *  @event GET rest/projects/:id
 *  @memberof module:rest/projects */
app.get('/:id',
  findProject,
  flow.or(
    projects.model.isPublic(),
    me.isOwnerOf('project'),
    me.isModerator),
  mw.res.json('project.toJSON()')
);

/** Update a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the Project to update
 *  @returns {object} The {@link module:models/project project}
 *  @event PATCH rest/projects/:id
 *  @memberof module:rest/projects */
app.patch('/:id',
  findProject,
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  // FIXME: is this all I need to update
  mw.body({ or: ['name', 'description', 'public'] }).pick().require(),
  projects.model.update({ $set: 'body' }),
  projects.findById('params.id'),
  mw.res.json('project.toJSON()')
);

/** Delete a {@link module:models/project Project}
 *  @param {ObjectId} id ID of the project to fetch
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/projects/:id
 *  @memberof module:rest/projects */
app.delete('/:id',
  findProject,
  flow.or(
    me.isOwnerOf('project'),
    me.isModerator),
  projects.removeById('project._id'),
  mw.res.send(204)
);

/* *** PROTECTED ROUTES *** */

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects
 *  @memberof module:rest/projects */
app.put('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PATCH rest/projects
 *  @memberof module:rest/projects */
app.patch('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event DELETE rest/projects
 *  @memberof module:rest/projects */
app.delete('/', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event POST rest/projects/:id
 *  @memberof module:rest/projects */
app.post('/:id', function (req, res) { res.send(405); });

/*  @returns {error} 405 - not allowed
 *  @event PUT rest/projects/:id
 *  @memberof module:rest/projects */
app.put('/:id', function (req, res) { res.send(405); });
