'use strict';

var isFunction = require('101/is-function');
var users = require('./user-factory');
var projects = require('./project-factory');

module.exports = {
  createRegisteredUserAndGroup: function (userBody, groupBody, cb) {
    if (isFunction(userBody)) {
      cb = userBody;
      userBody = {};
    } else if (isFunction(groupBody)) {
      cb = groupBody;
      groupBody = null;
    }
    var user = users.createRegistered(
      userBody.email, userBody.username, userBody.password, function (err) {
      if (err) { return cb(err); }

      var group = user.createGroup(groupBody, function (err) {
        cb(err, user, group);
      });
    });
  },
  createRegisteredUserAndProject: function (userBody, projectBody, cb) {
    if (isFunction(userBody)) {
      cb = userBody;
      userBody = {};
    }
    else if (isFunction(projectBody)) {
      cb = projectBody;
      projectBody = null;
    }
    var user = users.createRegistered(
      userBody.email, userBody.username, userBody.password, function (err) {
      if (err) { return cb(err); }

      var project = projects.createProjectBy(user, null, function (err) {
        cb(err, user, project);
      });
    });
  },
  createRegisteredUserProjectAndEnvironments: function (userBody, projectBody, cb) {
    if (isFunction(userBody)) {
      cb = userBody;
      userBody = {};
    }
    else if (isFunction(projectBody)) {
      cb = projectBody;
      projectBody = null;
    }
    this.createRegisteredUserAndProject(userBody, projectBody, function (err, user, project) {
      if (err) { return cb(err); }

      var environments = project.fetchEnvironments(function (err, body) {
        if (err) { return cb(err); }

        cb(err, user, project, environments);
      });
    });
  }
};
