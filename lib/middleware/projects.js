var _ = require('lodash');
var createMongooseMiddleware = require('./createMongooseMiddleware');
var async = require('async');
var configs = require('configs');
var Context = require('models/contexts');
var Project = require('models/projects');

var Boom = require('dat-middleware').Boom;
var ImageBuilder = require('docker-image-builder');

var projects = module.exports = createMongooseMiddleware(Project, {
  addContexts: function (req, res, next) {
    var project = req.project;
    var newContexts;
    if (req.contexts) {
      newContexts = req.contexts.map(function (context) {
        return { id: context._id, version: 'v0' };
      });
    } else if (req.context) {
      newContexts = [{ id: req.context._id, version: 'v0' }];
    } else {
      // no contexts to save!
      // throw a server error so we know to look!
      // also this allows us to not blame TJ... for once...
      return next(Boom.badImplementation('tried to add a context, did not find any'));
    }
    project.contexts.push.apply(project.contexts, newContexts);
    project.save(next);
  },
  buildFullProject: function (req, res, next) {
    var project = {
      contexts: []
    };

    _.forEach(req.contexts, function (context, id) {
      project.contexts.push({
        id: id,
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
  checkPublic: function (req, res, next) {
    next(req.project.public ? null : Boom.forbidden('project is not public'), this);
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
  pullContexts: function (req, res, next) {
    var project = req.project;
    var getContexts = {};
    project.contexts.forEach(function (context) {
      getContexts[context.id] = Context.findById.bind(Context, context.id);
    });
    async.parallel(getContexts, function (err, contexts) {
      // keep it as an object with the ids as the key for easy access
      req.contexts = contexts;
      next(err, project);
    });
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
