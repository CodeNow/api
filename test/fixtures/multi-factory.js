'use strict';

var MongoUser = require('models/mongo/user');
var uuid = require('uuid');
var tailBuildStream = require('./tail-build-stream');
var noop = function () {};

module.exports = {
  createUser: function (cb) {
    var host = require('./host');
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
  createBuild: function (cb) {
    this.createUser(function (err, user) {
      if (err) { return cb(err); }
      var build = user.createBuild(function (err) {
        cb(err, build, user);
      });
    });
  },
  createContext: function (cb) {
    this.createUser(function (err, user) {
      if (err) { return cb(err); }
      var context = user.createContext({ name: uuid() }, function (err) {
        cb(err, context, user);
      });
    });
  },
  createSourceContext: function (cb) {
    this.createModerator(function (err, moderator) {
      if (err) { return cb(err); }
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
      if (err) { return cb(err); }
      require('./mocks/s3/put-object')(context.id(), '/');
      var version = context.createVersion(function (err) {
        if (err) { return cb(err); }
        require('./mocks/s3/get-object')(context.id(), '/');
        require('./mocks/s3/get-object')(context.id(), '/Dockerfile');
        require('./mocks/s3/put-object')(context.id(), '/Dockerfile');
        version.rootDir.contents.create({
          name: 'Dockerfile',
          body: 'FROM dockerfile/nodejs\n'
        }, function (err) {
          cb(err, version, context, moderator);
        });
      });
    });
  },
  createContextVersion: function (ownerId, cb) {
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    }
    var self = this;
    this.createSourceContextVersion(function (err, srcContextVersion, srcContext, moderator) {
      if (err) { return cb(err); }
      self.createContext(function (err, context, user) {
        if (err) { return cb(err); }
        var data = { name: uuid() };
        if (ownerId) { data.owner = { github: ownerId }; }
        var build = user.createBuild({ message: uuid() }, function (err) {
          if (err) { return cb(err); }
          var opts = {};
          opts.qs = {
            toBuild: build.id()
          };

          require('./mocks/s3/put-object')(context.id(), '/');
          var contextVersion = context.createVersion(opts, function (err) {
            if (err) { return cb(err); }
            require('./mocks/s3/get-object')(srcContext.id(), '/');
            require('./mocks/s3/get-object')(srcContext.id(), '/Dockerfile');
            require('./mocks/s3/put-object')(context.id(), '/');
            require('./mocks/s3/put-object')(context.id(), '/Dockerfile');
            contextVersion.copyFilesFromSource(srcContextVersion.json().infraCodeVersion, function (err) {
              cb(err, contextVersion, context, build, user,
                [srcContextVersion, srcContext, moderator]);
            });
          });
        });
      });
    });
  },
  createBuiltBuild: function (ownerId, cb) {
    require('nock').cleanAll();
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    } else {
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    var self = this;
    this.createContextVersion(ownerId, function (err, contextVersion, context, build, user, srcArray) {
      if (err) { return cb(err); }
      require('./mocks/docker/container-id-attach')();
      self.buildTheBuild(user, build, ownerId, function (err) {
        if (err) { return cb(err); }
        require('./mocks/github/user')(user);
        contextVersion.fetch(function (err) {
          cb(err, build, user,
              [contextVersion, context, build, user],
              srcArray);
        });
      });
    });
  },
  createInstance: function (buildOwnerId, cb) {
    if (typeof buildOwnerId === 'function') {
      cb = buildOwnerId;
      buildOwnerId = null;
    } else {
      require('./mocks/github/user-orgs')(buildOwnerId, 'Runnable');
      require('./mocks/github/user-orgs')(buildOwnerId, 'Runnable');
    }
    this.createBuiltBuild(buildOwnerId, function (err, build, env, project, user, modelsArr, srcArr) {
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

  buildTheBuild: function (user, build, ownerId, cb) {
    require('nock').cleanAll();
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    } else {
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    require('./mocks/docker/container-id-attach')();
    build.fetch(function (err) {
      if (err) { return cb(err); }
      build.build({ message: uuid() }, function (err) {
        if (err) {
          cb = noop;
          cb(err);
        }
        tailBuildStream(build.contextVersions.models[0].id(), function (err) { // FIXME: maybe
          if (err) { return cb(err); }
          require('./mocks/github/user')(user);
          build.fetch(function (err) {
            cb(err);
          }); // get completed build
        });
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
