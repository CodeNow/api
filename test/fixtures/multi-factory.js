'use strict';

var MongoUser = require('models/mongo/user');
var uuid = require('uuid');
var tailBuildStream = require('./tail-build-stream');
var generateKey = require('./key-factory');
var EventEmitter = require('events').EventEmitter;
var noop = require('101/noop');

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
  createBuild: function (ownerId, cb) {
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
        var build = user.createBuild(data, function (err) {
          cb(err, build, context, user, [srcContextVersion, srcContext, moderator]);
        });
      });
    });
  },
  createContextVersion: function (ownerId, cb) {
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    }
    this.createBuild(ownerId, function (err, build, context, user, others) {
      if (err) { return cb(err); }
      var srcContextVersion = others[0];
      var srcContext = others[1];
      var moderator = others[2];
      require('./mocks/s3/put-object')(context.id(), '/');
      var opts = {};
      opts.qs = {
        toBuild: build.id()
      };
      var contextVersion = context.createVersion(opts, function (err) {
        if (err) { return cb(err); }
        require('./mocks/s3/get-object')(srcContext.id(), '/');
        require('./mocks/s3/get-object')(srcContext.id(), '/Dockerfile');
        require('./mocks/s3/put-object')(context.id(), '/');
        require('./mocks/s3/put-object')(context.id(), '/Dockerfile');
        contextVersion.copyFilesFromSource(srcContextVersion.json().infraCodeVersion, function (err) {
          if (err) { return cb(err); }
          generateKey(function (err) {
            if (err) { return cb(err); }
            var ghUser = user.json().accounts.github.username;
            var ghRepo = 'flaming-octo-nemesis';
            var repo = ghUser + '/' + ghRepo;
            require('./mocks/github/repos-username-repo')(user, ghRepo);
            require('./mocks/github/repos-hooks-get')(ghUser, ghRepo);
            require('./mocks/github/repos-hooks-post')(ghUser, ghRepo);
            require('./mocks/github/repos-keys-get')(ghUser, ghRepo);
            require('./mocks/github/repos-keys-post')(ghUser, ghRepo);
            require('./mocks/s3/put-object')('/runnable.deploykeys.test/'+ghUser+'/'+ghRepo+'.key.pub');
            require('./mocks/s3/put-object')('/runnable.deploykeys.test/'+ghUser+'/'+ghRepo+'.key');
            var repoData = {
              repo: repo,
              branch: 'master',
              commit: '065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac'
            };
            contextVersion.addGithubRepo({json: repoData}, function (err) {
              if (err) { return cb(err); }
              contextVersion.fetch(function (err) {
                cb(err, contextVersion, context, build, user,
                  [srcContextVersion, srcContext, moderator]);
              });
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
    this.createBuiltBuild(buildOwnerId, function (err, build, user, modelsArr, srcArr) {
      if (err) { return cb(err); }
      var body = {
        name: uuid(),
        build: build.id()
      };
      var instance = user.createInstance(body, function (err) {
        cb(err, instance, build, user, modelsArr, srcArr);
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
    var dispatch = new EventEmitter();
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
      build.contextVersions.models[0].fetch(function (err, cv) {
        if (err) { return cb(err); }
        require('./mocks/github/repos-username-repo-branches-branch')(cv);
        build.build({ message: uuid() }, function (err) {
          dispatch.emit('started', err);
          if (err) {
            cb = noop;
            cb(err);
          }
          require('./mocks/github/user')(user);
          build.contextVersions.models[0].fetch(function (err) {
            if (err) { return cb(err); }
            tailBuildStream(build.contextVersions.models[0].id(), function (err) { // FIXME: maybe
              if (err) { return cb(err); }
              require('./mocks/github/user')(user);
              build.fetch(function (err) {
                cb(err);
              }); // get completed build
            });
          });
        });
      });
    });
    return dispatch;
  },

  tailInstance: function (user, instance, ownerId, cb) {
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    }
    fetchInstanceAndCheckContainers();
    function fetchInstanceAndCheckContainers () {
      if (ownerId) {
        require('./mocks/github/user-orgs')(ownerId, 'Runnable');
        require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      }
      else {
        require('./mocks/github/user')(user);
      }
      instance.fetch(function (err) {
        if (err) {
          cb(err);
        }
        else if (
          !instance.attrs.containers.length ||
          !instance.attrs.containers[0].inspect
        ) {
          setTimeout(function () {
            fetchInstanceAndCheckContainers();
          }, 50);
        }
        else {
          cb(null, instance);
        }
      });
    }
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
  }
};
