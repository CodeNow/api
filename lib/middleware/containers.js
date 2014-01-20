var utils = require('./utils');
var users = require('./users');
var Container = require('../models/containers');

var containers = module.exports = {
  fetchContainerFromId: function (req, res, next) {
    var containerId = req.query.from;
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
    req.container.returnJSON(function (err, json) {
      if (err) {
        return next(err);
      }
      res.json(res.code || 200, json);
    });
  }
};