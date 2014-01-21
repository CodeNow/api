var utils = require('./utils');
var Container = require('../models/containers');
var async = require('async');
var _ = require('lodash');
var error = require('../error');
var users = require('./users');
var tokens = require('./tokens');

var containers = module.exports = {
  fetchContainer: function (req, res, next) {
    var containerId = utils.decodeId(req.params.containerId);
    if (!utils.isObjectId(containerId)) {
      return next(error(400, 'invalid container id'));
    }
    Container.findById(containerId, req.domain.intercept(function (container) {
      req.container = container;
      next();
    }));
  },
  checkContainerFound: function (req, res, next) {
    if (!req.container) {
      return next(error(404, "container not found"));
    }
    next();
  },
  createContainer: function (req, res, next) {
    res.code = 201;
    req.container = new Container({
      owner: req.user_id
    });
    next();
  },
  containerInheritFromImage: function (req, res, next) {
    req.container.inheritFromImage(req.image);
    next();
  },
  saveContainer: function (req, res, next) {
    req.container.save(next);
  },
  returnContainer: function (req, res, next) {
    req.container.returnJSON(req.domain.intercept(function (json) {
      res.json(res.code || 200, json);
    }));
  },
  queryContainers: function (req, res, next) {
    var query = _.pick(req.query, 'saved', 'name', 'description');
    if (!req.user) {
      next(error(500, 'req.user is required for fetch containers')); // developer error
    }
    query.owner = req.user._id;
    Container.find(query, { files: 0 }, req.domain.intercept(function (containers) {
      req.containers = containers;
      next();
    }));
  },
  updateContainer: function (req, res, next) {
    var allowed = ['saved', 'name', 'description'];
    var update = req.self.isModerator ? req.body : _.pick(req.body, allowed);
    req.container.set(update);
    containers.saveContainer(req, res, next);
  },
  returnContainers: function (req, res, next) {
    async.map(req.containers, function (container, cb) {
      container.returnJSON(cb);
    },
    req.domain.intercept(function (json) {
      res.json(200, json);
    }));
  },
  removeContainer: function (req, res, next) {
    Container.remove({ _id: req.container._id }, next);
  },
  updateOwnerToUser: function (req, res, next) {
    var token = req.get('runnable-token');
    if (!token) {
      next();
    } else {
      async.series([
        function (cb) {
          tokens.hasToken(req, res, cb);
        },
        function (cb) {
          users.fetchSelf(req, res, cb);
        }
      ], function (err) {
        if (err) {
          console.error(err);
          next();
        } else if (req.self.password) {
          next();
        } else {
          Container.update({
            owner: req.self._id
          }, {
            $set: {
              owner: req.user._id
            }
          }, next);
        }
      });
    }
  }
};