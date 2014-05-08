'use strict';

/**
 * Project middleware
 * @module middleware/projects
 */

var _ = require('lodash');
var createMongooseMiddleware = require('./createMongooseMiddleware');
var configs = require('configs');
var Context = require('models/contexts');
var Project = require('models/projects');

var ImageBuilder = require('docker-image-builder');

module.exports = createMongooseMiddleware(Project, {
  /** Build the full Project (with Contexts) and return references to Images!
   *  @param {object} req
   *  @param {module:models/project} req.project
   *  @param {module:models/context} req.context[] An array of the Contexts to build
   *  @param {object} res
   *  @param {object} next */
  buildFullProject: function (req, res, next) {
    var project = {
      contexts: []
    };

    _.forEach(req.contexts, function (context, contextId) {
      context.versions.push({});
      project.contexts.push({
        id: contextId,
        dockertag: _.last(context.versions)._id,
        dockerfile: context.dockerfile,
        source: context.source || {}
      });
    });

    var ib = new ImageBuilder({
      dockerHost: 'http://' + req.dockletResult,
      dockerPort: 4243,
      project: project,
      aws: {
        accessKeyId: configs.S3.auth.accessKey,
        secretAccessKey: configs.S3.auth.secretKey
      }
    });
    ib.run(function (err, imageIds) {
      if (!req.data) {
        req.data = {};
      }
      req.data.imageIds = imageIds;
      next(err, imageIds);
    });
  },
  copyActionUpdateName: function (req, res, next) {
    // we want to be able to define how new projects are renamed
    // when they are copied. this will be that logic
    var oldName = req.project.name;
    var username = req.user.username;
    // for now, just prepend the username to the old name
    req.body.name = username + '-' + oldName;
    next(null, this);
  },
  /** Get the Contexts for the default environment for the Project
   *  @param {object} req
   *  @param {module:model/project} req.project
   *  @param {object} res
   *  @param {object} next */
  pullContexts: function (environment) {
    return function (req, res, next) {
      var project = req.project;
      var getContexts = [];
      var envIndex;
      if (/^(body|params|query)\.environment$/g.test(environment)) {
        envIndex = _.findIndex(project.environments, { isDefault: true });
      } else {
        envIndex = _.findIndex(project.environments, { _id: environment });
      }
      project.environments[envIndex].contexts.forEach(function (context) {
        getContexts.push(context.context);
      });
      Context.findByIds(getContexts, function (err, contexts) {
        req.contexts = contexts;
        next(err, project);
      });
    };
  },
  respond: function (req, res, next) {
    var self = this;
    var model = req[this.key];
    if (model) {
      if (model.returnJSON) {
        model.returnJSON(req.domain.intercept(function (json) {
          req[self.key] = json;
          self.super.respond(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
    }
    else if (req[this.pluralKey]) {
      this.respondList(req, res, next);
    }
    else {
      this.checkFound(req, res, next);
    }
  }
});
