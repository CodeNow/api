'use strict';

var isFunction = require('101/is-function');
var async = require('async');
var users = require('./user-factory');
var projects = require('./project-factory');
var User = require('runnable');
var host = require('./host');
var uuid = require('uuid');
var nockGithub = require('./nock-github');

module.exports = {
  createUser: function (cb) {
    nockGithub();
    nockGithub();
    var user = new User(host);
    user.githubLogin('mysupersecrettoken', function (err) {
      cb(err, user);
    });
    return user;
  },
  createProject: function (cb) {
    var user = this.createUser(function (err) {
      if (err) { return cb(err); }
      var project = user.createProject({ name: uuid() }, function (err) {
        cb(err, project, user);
      });
    });
  },
  createEnv: function (cb) {
    this.createProject(function (err, project, user) {
      if (err) { return cb(err); }
      var environments = project.fetchEnvironments(function (err) {
        cb(err, environments.models[0], project, user);
      });
    });
  },
  createBuild: function (cb) {
    this.createEnv(function (err, env, project, user) {
      if (err) { return cb(err); }
      var build = env.createBuild(function (err) {
        cb(err, build, env, project, user);
      });
    });
  },
  //
  createContext: function (user, cb) {
    if (typeof user === 'function') {
      user = null;
    }
    async.waterfall([
      function getUser (cb) {
        if (user) {
          cb(null, user);
        }
        else {
          user = this.createUser(function (err) {
            cb(err, user);
          });
        }
      },
      function createContext (user, cb) {
        var context = user.createContext({ name: uuid() }, function (err) {
          cb(err, context, user);
        });
      }
    ], cb);
  },
  createRegisteredUserAndGroup: function (userBody, groupBody, cb) {
    if (isFunction(userBody)) {
      cb = userBody;
      userBody = {};
    } else if (isFunction(groupBody)) {
      cb = groupBody;
      groupBody = null;
    }
    var user = users.createGithub(function (err) {
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
    var user = users.createGithub(function (err) {
      if (err) { return cb(err); }

      var project = projects.createProjectBy(user, null, function (err) {
        cb(err, user, project);
      });
    });
  },
  createRegisteredUserAndUnbuiltProject: function (userBody, projectBody, cb) {
    if (isFunction(userBody)) {
      cb = userBody;
      userBody = {};
    }
    else if (isFunction(projectBody)) {
      cb = projectBody;
      projectBody = null;
    }
    var user = users.createGithub(function (err) {
      if (err) { return cb(err); }

      var project = projects.createUnbuiltProjectBy(user, null, function (err) {
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

      var environments = project.fetchEnvironments(function (err) {
        cb(err, user, project, environments);
      });
    });
  }
};
