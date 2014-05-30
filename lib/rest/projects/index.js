'use strict';

/**
 * Project API
 * @module rest/projects
 */

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var me = require('middleware/me');
var projects = require('middleware/projects');
var validations = require('middleware/validations');
var utils = require('middleware/utils');

function validQuerySortParams (field) {
  var validFields = [
    '-votes',
    'votes',
    '-created',
    'created',
    '-views',
    'views',
    '-runs',
    'runs'
  ];
  return validFields.indexOf(field) === -1 ?
    mw.Boom.badRequest('field not allowed for sorting: ' + field) :
    null;
}

var findProject = flow.series(
  mw.params('id').require().validate(validations.isObjectId),
    projects.findById('params.id', {}),
    projects.checkFound);

// list all projects
app.get('/',
  mw.query('all', 'search', 'channel', 'owner', 'sort', 'page', 'limit', 'name').pick(),
  // if (query.search)
  mw.query('search').require()
    .then(
      projects.search('query.search'),
      projects.respond),
  // utils.formatPaging(), // FIXME: PAGING DOES NOT WORK
  mw.query('all', 'search', 'channel', 'owner', 'sort', 'page', 'limit', 'name').pick(),
  utils.formatPaging(),
  mw.query('sort').validate(validQuerySortParams),
  projects.findPage('query'),
  projects.respond);

/** Create a new {@link module:models/project Project}
 *  @param {object} [query]
 *  @param {ObjectId} [query.from] ID of the Project from which to copy
 *  @param {object} body
 *  @param {string} body.name Name of the project to create
 *  @param {array.string} body.contexts Array of contexts to create within the project
 *  @param {string} body.contexts[].name Name of the context to create
 *  @param {string} body.contexts[].dockerfile Contents of the Dockerfile for the context
 *  @returns {object} The new project, with NO containers
 *  @event POST rest/projects/
 *  @memberof module:rest/projects */
var props = {
  name: 'body.name',
  description: 'body.description',
  owner: 'userId',
  public: true // soon to be false by default
};
app.post('/',
  me.isRegistered,
  mw.body('name', 'description', 'dockerfile', 'githubRepo').pick(),
  mw.body('name').require(),
  mw.body({ or: ['githubRepo', 'dockerfile'] }).require(),
  // FIXME: handle github create
  mw.body('githubRepo').require().then(
    function (){} //FIXME: implement me
  ),
  mw.body('dockerfile').require().then(
    projects.createAndSaveFromDockerfile('body.dockerfile', props)),
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
