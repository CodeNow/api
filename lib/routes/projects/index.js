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
var parallel = flow.parallel;

var me = require('middlewares/me');
var mongoMiddlewares = require('middlewares/mongo');
var apiMiddlewares = require('middlewares/apis');
var projects = mongoMiddlewares.projects;
var contexts = mongoMiddlewares.contexts;
var contextVersions = mongoMiddlewares.contextVersions;
var infraCodeVersions = mongoMiddlewares.infraCodeVersions;
var builds = mongoMiddlewares.builds;
var docklet = apiMiddlewares.docklet;
var docker = apiMiddlewares.docker;
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
  mw.query('search', 'owner', 'name', 'ownerUsername', 'sort', 'page', 'limit').pick(),
  mw.query({ or: ['owner', 'name', 'ownerUsername', 'search', 'sort'] }).require(),
  // FIXME: github query needed
  // mw.query('ownerUsername').require()
  //   .then(
  //     users.findByUsername('query.ownerUsername'),
  //     checkFound('user'),
  //     mw.query().set('owner', 'user._id'),
  //     mw.query().unset('ownerUsername')),
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

/** Create a new unbuilt {@link module:models/project Project}
 *  @param {object} [query]
 *  @param {ObjectId} [query.from] ID of the Project from which to copy
 *  @param {object} body
 *  @param {string} body.name Name of the project to create
 *  @param {array.string} body.contexts Array of contexts to create within the project
 *  @param {string} body.contexts[].name Name of the context to create
 *  @returns {object} The new project, with NO containers
 *  @event POST rest/projects
 *  @memberof module:rest/projects */
 // version is context version
var createUnbuiltProject = flow.series(
  projects.create('body'),
  projects.model.set({ 'public': false }),
  projects.model.pushEnvironment({
    name: 'master',
    owner: 'body.owner'
  }),
  contexts.create({
    name: 'body.name',
    owner: 'body.owner'
  }),
  infraCodeVersions.create({
    environment: 'project.environments[0]._id',
    context: 'context._id'
  }),
  infraCodeVersions.model.initWithDefaults(),
  contextVersions.create({
    createdBy: 'project.owner',
    context: 'context._id',
    infraCodeVersion: 'infraCodeVersion._id'
  }),
  builds.create({
    createdBy: 'project.owner',
    project: 'project._id',
    environment: 'project.environments[0]._id',
    contexts: ['context._id'],
    contextVersions: ['contextVersion._id']
  }),
  // FIXME: remove all on error
  parallel(
    projects.model.save(),
    contexts.model.save(),
    infraCodeVersions.model.save(),
    contextVersions.model.save(),
    builds.model.save()
  ),
  // ).catch(
  //   mw.req().setToErr('err'),
  //   contextVersions.model.remove(),
  //   contexts.model.remove(),
  //   builds.model.remove(),
  //   projects.model.remove(),
  //   mw.next('err')
  // ),
  mw.res.json(201, 'project.toJSON()')
);

/** Create a new {@link module:models/project Project}
 *  @param {object} [query]
 *  @param {ObjectId} [query.from] ID of the Project from which to copy
 *  @param {object} body
 *  @param {string} body.name Name of the project to create
 *  @param {array.string} body.contexts Array of contexts to create within the project
 *  @param {string} body.contexts[].name Name of the context to create
 *  @param {string} body.contexts[].dockerfile Contents of the Dockerfile for the context
 *  @returns {object} The new project, with NO containers
 *  @event POST rest/projects
 *  @memberof module:rest/projects */
var createProjectFromDockerfile = flow.series(
  projects.create('body'),
  projects.model.set({ 'public': false }),
  projects.model.pushEnvironment({
    name: 'master',
    owner: 'body.owner'
  }),
  contexts.create({
    name: 'body.name',
    owner: 'body.owner'
  }),
  infraCodeVersions.create({
    context: 'context._id'
  }),
  infraCodeVersions.model.initWithDockerfile('body.dockerfile'),
  contextVersions.create({
    owner: 'body.owner',
    infraCodeVersion: 'infraCodeVersion._id',
    context: 'context._id',
    createdBy: 'body.owner'
  }),
  // FIXME: remove all on error
  parallel(
    projects.model.save(),
    contexts.model.save(),
    infraCodeVersions.model.save(),
    contextVersions.model.save()
  ),
  docklet.create(),
  docklet.model.findDock(),
  docker.create('dockletResult'),
  docker.model.buildVersion('contextVersion'),
  contextVersions.model.set({
    dockerHost: 'dockletResult',
    build: 'dockerResult'
  }),
  builds.create({
    project : 'project._id',
    environment: 'project.environments[0]._id',
    contexts: ['context'],
    contextVersions: ['contextVersion'],
    createdBy: 'body.owner'
  }),
  // FIXME: remove all on error
  // flow.try(
  parallel(
    projects.model.save(),
    contextVersions.model.save(),
    builds.model.save()
  ),
  // ).catch(
  //   mw.req().setToErr('err'),
  //   contextVersions.model.remove(),
  //   contexts.model.remove(),
  //   builds.model.remove(),
  //   projects.model.remove(),
  //   mw.next('err')
  // ),
  mw.res.json(201, 'project.toJSON()')
);
app.post('/',
  me.isRegistered,
  mw.body('name', 'description', 'dockerfile', 'githubRepo', 'owner', 'test').pick(),
  mw.body('name').require(),
  // FIXME: if owner then find owner, verify user is owner or in group
  mw.body('owner.github').require()
    .then(mw.body('owner.github').number())
    .else(function (req, res, next) {
      req.body.owner = { github: req.sessionUser.accounts.github.id };
      next();
    }),
  mw.body({ or: ['githubRepo', 'dockerfile', 'test'] }).require(),
  // FIXME: handle github create
  mw.body('githubRepo').require().then(
    function (){}), //FIXME: implement me
  mw.body('dockerfile').require()
    .then(createProjectFromDockerfile)
    .else(createUnbuiltProject),
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
