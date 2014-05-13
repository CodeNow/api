'use strict';

/**
 * Project middleware
 * @module middleware/projects
 */

var async = require('async');
var Boom = require('dat-middleware').Boom;
var createMongooseMiddleware = require('./createMongooseMiddleware');
var configs = require('configs');
var debug = require('debug')('project:middleware');
var keypather = require('keypather')();
var ImageBuilder = require('docker-image-builder');
var last = require('101/last');
var pick = require('101/pick');
var findIndex = require('101/find-index');
var join = require('path').join;

var Context = require('models/contexts');
var Project = require('models/projects');


module.exports = createMongooseMiddleware(Project, {
  /** Build the full Project (with Contexts) and return references to Images!
   *  @param {object} req
   *  @param {module:models/project} req.project
   *  @param {module:models/context} req.context[] An array of the Contexts to build
   *  @param {object} res
   *  @param {object} next */
  buildFullProject: function (dockletResultKey, environmentKey) {
    return function (req, res, next) {
      debug('starting build');
      var dockerHost = keypather.get(req, dockletResultKey);
      var environmentName = keypather.get(req, environmentKey);
      var environmentIndex = req.project.getEnvironmentIndex(environmentName);
      var buildProject = {
        contexts: []
      };

      var updateContextByTag = {};
      req.contexts.forEach(function (context) {
        context.versions.push({});
        var newVersionId = last(context.versions)._id;
        var fullTag = configs.dockerRegistry + join('/', context.ownerUsername, context.name) +
          ':' + newVersionId.toString();
        updateContextByTag[fullTag] = { 'version': newVersionId, 'context': context._id };
        buildProject.contexts.push({
          id: context._id,
          dockertag: fullTag,
          dockerfile: context.dockerfile,
          source: context.source || {}
        });
      });

      var ib = new ImageBuilder({
        dockerHost: 'http://' + dockerHost,
        dockerPort: 4243,
        project: buildProject,
        aws: {
          accessKeyId: configs.S3.auth.accessKey,
          secretAccessKey: configs.S3.auth.secretKey
        }
      });
      ib.run(function (err, imageIds) {
        if (err) {
          return next(err);
        }
        debug('done building');
        if (!req.data) {
          req.data = {};
        }
        // update the environment in the project to have the correct version for each context
        Object.keys(updateContextByTag).forEach(function (fullTag) {
          var versionData = updateContextByTag[fullTag];
          var contextIndex = findIndex(req.project.environments[environmentIndex].contexts,
            whereContextId(versionData.context));
          req.project.environments[environmentIndex].contexts[contextIndex].version =
            versionData.version;
        });
        req.buildResults = imageIds;
        next(err, req.project);
      });
    };

    function whereContextId (contextId) {
      return function (context) { return context.context.toString() === contextId.toString(); };
    }
  },
  copyActionUpdateName: function (req, res, next) {
    // we want to be able to define how new projects are renamed
    // when they are copied. this will be that logic
    var oldName = req.project.name;
    var username = req.me.lower_username;
    // for now, just prepend the username to the old name
    req.body.name = username + '-' + oldName;
    next(null, this);
  },
  copyContexts: function (destEnvironmentKey) {
    return function (req, res, next) {
      debug('starting to copy contexts');
      var destEnvironment = keypather.get(req, destEnvironmentKey);
      var destEnvironmentIndex = req.project.getEnvironmentIndex(destEnvironment);
      var tasks = [];
      req.contexts.forEach(function (context) {
        tasks.push(context.copy.bind(context));
      });
      async.series(tasks, function (err, results) {
        if (err) {
          return next(err);
        }
        debug('copied all the contexts');
        results.forEach(function (context) {
          req.project.environments[destEnvironmentIndex].contexts.push({
            context: context._id,
            version: context.versions.length ? last(context.versions)._id : null
          });
        });
        next(err, req.project);
      });
    };
  },
  /** Get the Contexts for an environment on the Project
   *  @param {string} [environmentKey=default] Name of the environment */
  pullContexts: function (environmentKey) {
    return function (req, res, next) {
      var environment = keypather.get(req, environmentKey);
      var project = req.project;
      var getContexts = [];
      req.envIndex = project.getEnvironmentIndex(environment);
      if (req.envIndex === -1) {
        return next(Boom.badRequest('environment does not exist'));
      }
      project.environments[req.envIndex].contexts.forEach(function (context) {
        getContexts.push(context.context);
      });
      Context.findByIds(getContexts, function (err, contexts) {
        req.contexts = contexts;
        next(err, project);
      });
    };
  },
  respond: function (req, res, next) {
    if (req[this.pluralKey]) {
      // FIXME: fix responding lists...
      next(Boom.badImplementation('need to fix this'));
      // this.respondList(req, res, next);
    }
    else {
      var model = req[this.key];
      model = model.toJSON ? model.toJSON() : model;
      model = appendContextAndFilterEnvironments();
      res.json(res.code || 200, model);
    }

    function appendContextAndFilterEnvironments () {
      var envIndex = req.envIndex ? req.envIndex : req.project.getEnvironmentIndex();
      model.contexts = req.contexts && req.contexts.toJSON ? req.contexts.toJSON() : req.contexts;
      model.environment = model.environments[envIndex];
      model.environments = model.environments.map(function (environment) {
        if (environment.owner.toString() !== req.user_id.toString()) {
          return;
        } else {
          return pick(environment, ['name', 'isDefault', 'owner', '_id']);
        }
      });
      return model;
    }
  }
});
