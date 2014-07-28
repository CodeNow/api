'use strict';

var MongoUser = require('models/mongo/user');
var host = require('./host');
var uuid = require('uuid');
var tailBuildStream = require('./tail-build-stream');
var noop = function () {};

module.exports = {
  createUser: function (cb) {
    var token = uuid();
    require('./mocks/github/action-auth')(token);
    var User = require('runnable');
    var user = new User(host);
    user.githubLogin(token, function (err) {
      if (err) {
        return cb(err);
      }
      else {
        user.attrs.accounts.github.accessToken = token;
        cb(null, user);
      }
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
    this.createUser(function (err, user) {
      if (err) { return (err); }
      var context = user.createContext({ name: uuid() }, function (err) {
        cb(err, context, user);
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
      require('./mocks/s3/put-object')(context.id(), '/');
      var version = context.createVersion(function (err) {
        if (err) { return (err); }
        require('./mocks/s3/put-object')(context.id(), '/Dockerfile');
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
      self.createContext(function (err, context, user) {
        if (err) { return cb(err); }
        var project = user.createProject({ name: uuid() }, function (err) {
          if (err) { return cb(err); }
          var env = project.defaultEnvironment;
          var build = env.createBuild({ message: uuid() }, function (err) {
            if (err) { return cb(err); }
            var opts = {};
            opts.qs = {
              // fromSource: srcContextVersion.json().infraCodeVersion,
              toBuild: build.id()
            };
            opts.json = {
              project: project.id(),
              environment: env.id()
            };
            require('./mocks/s3/put-object')(context.id(), '/');
            var contextVersion = context.createVersion(opts, function (err) {
              if (err) { return cb(err); }
              require('./mocks/s3/get-object')(srcContext.id(), '/');
              require('./mocks/s3/get-object')(srcContext.id(), '/Dockerfile');
              require('./mocks/s3/put-object')(context.id(), '/');
              require('./mocks/s3/put-object')(context.id(), '/Dockerfile');
              contextVersion.copyFilesFromSource(srcContextVersion.json().infraCodeVersion, function (err) {
                cb(err, contextVersion, context, build, env, project, user,
                  [srcContextVersion, srcContext, moderator]);
              });
            });
          });
        });
      });
    });
  },
  createBuiltBuild: function (cb) {
    var self = this;
    require('nock').cleanAll(),
    this.createContextVersion(function (err, contextVersion, context, build, env, project, user, srcArray) {
      if (err) { return cb(err); }
      require('./mocks/docker/container-id-attach')();
      self.buildTheBuild(user, build, function (err) {
        if (err) { return cb(err); }
        require('./mocks/github/user')(user);
        contextVersion.fetch(function (err) {
          cb(err, build, env, project, user,
              [contextVersion, context, build, env, project, user],
              srcArray);
        });
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

  buildTheBuild: function (user, build, cb) {
    require('nock').cleanAll(),
    require('./mocks/docker/container-id-attach')();
    build.fetch(function (err) {
      if (err) { return cb(err); }
      tailBuildStream(build.contextVersions.models[0].id(), function (err) { // FIXME: maybe
        if (err) { return cb(err); }
        require('./mocks/github/user')(user);
        build.fetch(function (err) {
          cb(err);
        }); // get completed build
      });
      build.build({ message: uuid() }, function (err) {
        if (err) {
          cb = noop;
          cb(err);
        }
      });
    });
  },

  createContextPath: function (user, contextId) {
      return user
        .newContext(contextId);
  },

  createContextVersionPath: function (user, contextId, contextVersionId) {
    return user
      .newContext(contextId)
      .newVersion(contextVersionId);
  },

  createContainerPath: function (user, instanceId, containerId) {
  return user
    .newInstance(instanceId)
    .newContainer(containerId);
  },

  createBuildPath: function (user, projectId, envId, buildId) {
    return user
      .newProject(projectId)
      .newEnvironment(envId)
      .newBuild(buildId);
  }


};
