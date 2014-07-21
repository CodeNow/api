'use strict';

var isFunction = require('101/is-function');
var users = require('./user-factory');
var projects = require('./project-factory');
var MongoUser = require('models/mongo/user');
var host = require('./host');
var uuid = require('uuid');
var tailBuildStream = require('./tail-build-stream');
var noop = function () {};

module.exports = {
  createUser: function (cb) {
    require('./mocks/github/action-auth')();
    var User = require('runnable');
    var user = new User(host);
    user.githubLogin('mysupersecrettoken', function (err) {
      cb(err, user);
    });
    return user;
  },
  createModerator: function (cb) {
    return this.createUser(function (err, user) {
      if (err) { return cb(err); }
      var $set = {
        permissionLevel: 5
      };
      MongoUser.updateById(user.id(), { $set: $set }, function (err) {
        cb(err, user);
      });
    });
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
      var build = env.createBuild({ environment: env.id() }, function (err) {
        cb(err, build, env, project, user);
      });
    });
  },
  createContext: function (cb) {
    this.createBuild(function (err, build, env, project, user) {
      if (err) { return cb(err); }
      var contextId = build.json().contexts[0];
      var context = user.fetchContext(contextId, function (err) {
        cb(err, context, build, env, project, user);
      });
    });
  },
  createSourceContext: function (cb) {
    this.createModerator(function (err, moderator) {
      if (err) { return (err); }
      var body = {
        name: uuid(),
        isSource: true
      };
      var context = moderator.createContext(body, function (err) {
        if (err) { return cb(err); }
        cb(err, context, moderator);
      });
    });
  },
  createSourceContextVersion: function (cb) {
    this.createSourceContext(function (err, context, moderator) {
      if (err) { return (err); }
      require('../fixtures/nock-s3')();
      var version = context.createVersion(function (err) {
        if (err) { return (err); }
        require('async').series([
          version.createFile.bind(version, { json: {
            name: 'Dockerfile',
            path: '/',
            body: 'FROM dockerfile/nodejs\n'
          }})
        ], function (err) {
          cb(err, version, context, moderator);
        });
      });
    });
  },
  createContextVersion: function (cb) {
    var self = this;
    this.createSourceContextVersion(function (err, srcContextVersion, srcContext, moderator) {
      if (err) { return cb(err); }
      self.createContext(function (err, context, build, env, project, user) {
        if (err) { return cb(err); }
        var opts = {};
        opts.qs = {
          fromSource: srcContextVersion.json().infraCodeVersion,
          toBuild: build.id()
        };
        opts.json = {
          project: project.id(),
          environment: env.id()
        };
        var contextVersion = context.createVersion(opts, function (err) {
          cb(err, contextVersion, context, build, env, project, user,
            [srcContextVersion, srcContext, moderator]);
        });
      });
    });
  },
  createBuiltBuild: function (cb) {
    var self = this;
    this.createContextVersion(function (err, contextVersion, context, build, env, project, user, srcArray) {
      if (err) { return cb(err); }
      self.buildTheBuild(build, function (err) {
        cb(err, build, env, project, user,
            [contextVersion, context, build, env, project, user],
            srcArray);
      });
    });
  },
  createInstance: function (cb) {
    this.createBuiltBuild(function (err, build, env, project, user, modelsArr, srcArr) {
      if (err) { return cb(err); }
      var body = {
        name: uuid(),
        build: build.id()
      };
      var instance = user.createInstance(body, function (err) {
        cb(err, instance, build, env, project, user, modelsArr, srcArr);
      });
    });
  },
  createContainer: function (cb) {
    this.createInstance(function (err, instance, build, env, project, user, modelsArray, srcArr) {
      if (err) { return cb(err); }
      var container = instance.newContainer(instance.json().containers[0]);
      cb(err, container, instance, build, env, project, user, modelsArray, srcArr);
    });
  },

  buildTheBuild: function (build, cb) {
    require('./mocks/docker/container-id-attach')();
    build.fetch(function (err) {
      if (err) { return cb(err); }
      tailBuildStream(build.json().contextVersions[0], function (err) { // FIXME: maybe
        if (err) { return cb(err); }
        build.fetch(cb); // get completed build
      });
      build.build({ message: uuid() }, function (err) {
        if (err) {
          cb = noop;
          cb(err);
        }
      });
    });
  },
  //
  // OLD:
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
