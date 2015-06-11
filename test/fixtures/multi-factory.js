/**
 * @module test/fixtures/multi-factory
 */
'use strict';

var EventEmitter = require('events').EventEmitter;
var createCount = require('callback-count');
var debug = require('debug')('runnable-api:multi-factory');
var formatArgs = require('format-args');
var isFunction = require('101/is-function');
var randStr = require('randomstring').generate;
var uuid = require('uuid');

var MongoUser = require('models/mongo/user');
var dockerMockEvents = require('./docker-mock-events');
var generateKey = require('./key-factory');
var primus = require('./primus');

module.exports = {
  createUser: function (opts, cb) {
    if (isFunction(opts)) {
      cb = opts;
      opts = {};
    }
    debug('createUser', formatArgs(arguments));
    var host = require('./host');
    var token = uuid();
    var name = opts.username || randStr(5);
    require('./mocks/github/action-auth')(token, undefined, name);
    var User = require('runnable');
    opts.userContentDomain = process.env.USER_CONTENT_DOMAIN;
    var user = new User(host, opts);
    user.githubLogin(token, function (err) {
      if (err) {
        return cb(err);
      }
      else {
        user.attrs.accounts.github.accessToken = token;
        user.attrs.accounts.github.username = name;
        cb(null, user);
      }
    });
    return user;
  },
  createHelloRunnableUser: function (cb) {
    debug('createUser', formatArgs(arguments));
    var host = require('./host');
    var token = uuid();
    require('./mocks/github/action-auth')(token,
      process.env.HELLO_RUNNABLE_GITHUB_ID);
    var User = require('runnable');
    var user = new User(host);
    user.opts.userContentDomain = process.env.USER_CONTENT_DOMAIN;
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
    debug('createModerator', formatArgs(arguments));
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
  createContext: function (ownerId, cb) {
    debug('createContext', formatArgs(arguments));
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    }
    if (ownerId) {
      // create context
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    this.createUser(function (err, user) {
      if (err) { return cb(err); }
      var body = { name: randStr(5) };
      if (ownerId) { body.owner = { github: ownerId }; }
      var context = user.createContext(body, function (err) {
        cb(err, context, user);
      });
    });
  },
  createSourceContext: function (cb) {
    debug('createSourceContext', formatArgs(arguments));
    this.createModerator(function (err, moderator) {
      if (err) { return cb(err); }
      var body = {
        name: randStr(5),
        isSource: true
      };
      var context = moderator.createContext(body, function (err) {
        if (err) { return cb(err); }
        cb(err, context, moderator);
      });
    });
  },
  createSourceContextVersion: function (cb) {
    debug('createSourceContextVersion', formatArgs(arguments));
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
          body: 'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n'
        }, function (err) {
          cb(err, version, context, moderator);
        });
      });
    });
  },
  createBuild: function (ownerId, cb) {
    debug('createBuild', formatArgs(arguments));
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    }
    if (ownerId) {
      // create build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    var self = this;
    this.createSourceContextVersion(function (err, srcContextVersion, srcContext, moderator) {
      if (err) { return cb(err); }
      self.createContext(ownerId, function (err, context, user) {
        if (err) { return cb(err); }
        var body = { name: randStr(5) };
        if (ownerId) { body.owner = { github: ownerId }; }
        var build = user.createBuild(body, function (err) {
          cb(err, build, context, user, [srcContextVersion, srcContext, moderator]);
        });
      });
    });
  },
  createContextVersion: function (ownerId, cb) {
    debug('createContextVersion', formatArgs(arguments));
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    } else {
      /**
       * Mock successive github API requests that will occur
       * internally as a result of the following API requests
       */
      // post copy version from source
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // post create app code version
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // // fetch build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // fetch context-version
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
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
              build.fetch(function (err) {
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
    });
  },
  createBuiltBuild: function (ownerId, cb) {
    debug('createBuiltBuild', formatArgs(arguments));
    require('nock').cleanAll();
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    } else {
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    var self = this;
    debug('this.createContextVersion', ownerId);
    this.createContextVersion(ownerId, function (err, contextVersion, context, build, user, srcArray) {
      if (err) { return cb(err); }
      debug('self.buildTheBuild', user.id(), build.id(), ownerId);
      self.buildTheBuild(user, build, ownerId, function (err) {
        if (err) { return cb(err); }
        require('./mocks/github/user')(user);
        require('./mocks/github/user-orgs')(ownerId, 'Runnable');
        debug('contextVersion.fetch', contextVersion.id());
        contextVersion.fetch(function (err) {
          cb(err, build, user,
              [contextVersion, context, build, user],
              srcArray);
        });
      });
    });
  },
  /**
   * Creates and waits for primus org room events indicating
   * instance has completed deploying via background worker
   * process.
   * @param {Object} primus - already connected primus fixture
   * @param {Function} finalCb
   */
  createAndTailInstance: function (primus, buildOwnerId, buildOwnerName, finalCb) {
    debug('createAndTailInstance');
    if (typeof buildOwnerId === 'function') {
      finalCb = buildOwnerId;
      buildOwnerId = null;
    }
    if (typeof buildOwnerName === 'function') {
      finalCb = buildOwnerName;
      buildOwnerName = 'Runnable';
    }
    var ctx = {};
    this.createBuiltBuild(buildOwnerId, function (err, build, user, modelsArr, srcArr) {
      if (err) { return finalCb(err); }
      ctx.build = build;
      ctx.user = user;
      ctx.modelsArr = modelsArr;
      ctx.srcArr = srcArr;
      var body = {
        name: uuid(),
        build: build.id(),
        masterPod: true
      };
      if (buildOwnerId) {
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        // redeploy
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
      } else {
        require('./mocks/github/user')(user);
        require('./mocks/github/user')(user);
      }
      require('./mocks/github/user')(user);
      function CountCallback () {
        ctx.instance.fetch(function (err) {
          if (err) { return finalCb(err); }
          finalCb(null, ctx.instance, ctx.build, ctx.user, ctx.modelsArr, ctx.scrArr);
        });
      }
      var count = createCount(2, CountCallback);
      primus.joinOrgRoom(user.json().accounts.github.id, function (err) {
        if (err) { return finalCb(err); }
        primus.expectAction('start', {}, count.next);
        ctx.instance = user.createInstance(body, function (err) {
          if (err) { return finalCb(err); }
          count.next();
        });
      });
    });
  },
  createInstance: function (buildOwnerId, buildOwnerName, cb) {
    debug('createInstance', formatArgs(arguments));
    if (typeof buildOwnerId === 'function') {
      cb = buildOwnerId;
      buildOwnerId = null;
    }
    if (typeof buildOwnerName === 'function') {
      cb = buildOwnerName;
      buildOwnerName = 'Runnable';
    }
    this.createBuiltBuild(buildOwnerId, function (err, build, user, modelsArr, srcArr) {
      if (err) { return cb(err); }
      var body = {
        name: randStr(5),
        build: build.id(),
        masterPod: true
      };
      if (buildOwnerId) {
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        // redeploy
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName);
      } else {
        require('./mocks/github/user')(user);
        require('./mocks/github/user')(user);
      }
      require('./mocks/github/user')(user);
      var instance = user.createInstance(body, function (err) {
        if (err) { return cb(err); }
        // hold until instance worker completes
        cb(err, instance, build, user, modelsArr, srcArr);
        /*
        module.exports.tailInstance(user, instance, function (err, instance) {
          console.log('tail instancep', arguments);
        });
        */
      });
    });
  },

  createAndTailContainer: function (primus, cb) {
    debug('createAndTailContainer', formatArgs(arguments));
    this.createAndTailInstance(primus, function (err, instance, build, user, modelsArray, srcArr) {
      if (err) { return cb(err); }
      var container = instance.newContainer(instance.json().containers[0]);
      cb(err, container, instance, build, user, modelsArray, srcArr);
    });
  },

  createContainer: function (cb) {
    debug('createContainer', formatArgs(arguments));
    var _this = this;
    this.createAndTailInstance(function (err, instance, build, user, modelsArray, srcArr) {
      if (err) { return cb(err); }
      _this.tailInstance(user, instance, function (err) {
        if (err) { return cb(err); }
        var container = instance.newContainer(instance.json().containers[0]);
        cb(err, container, instance, build, user, modelsArray, srcArr);
      });
    });
  },

  buildTheBuild: function (user, build, ownerId, cb) {
    debug('buildTheBuild', formatArgs(arguments));
    require('nock').cleanAll();
    var dispatch = new EventEmitter();
    if (typeof ownerId === 'function') {
      cb = ownerId;
      ownerId = null;
    } else {
      // build fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // version fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // build build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // version fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
      // build fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable');
    }
    debug('build.fetch', build.id());
    build.fetch(function (err) {
      if (err) { return cb(err); }
      debug('build.contextVersions.models[0].fetch');
      build.contextVersions.models[0].fetch(function (err, cv) {
        if (err) { return cb(err); }
        require('./mocks/github/repos-username-repo-branches-branch')(cv);
        debug('build.build', build.id());
        build.build({ message: uuid() }, function (err) {
          dispatch.emit('started', err);
          if (err) { return cb(err); }
          cv = build.contextVersions.models[0]; // cv may have been deduped
          debug('cv.fetch', cv.id());
          cv.fetch(function (err) {
            if (err) { return cb(err); }
            cv = cv.toJSON();
            if (cv.build.completed) { return cb(); }
            debug('primus.joinOrgRoom', ownerId || user.json().accounts.github.id);
            primus.joinOrgRoom(ownerId || user.json().accounts.github.id, function() {
              debug('primus.onceVersionComplete', cv._id);
              primus.onceVersionComplete(cv._id, function() {
                debug('version complete', cv._id);
                require('./mocks/github/user')(user);
                var count = createCount(2, cb);
                build.contextVersions.models[0].fetch(count.next);
                require('./mocks/github/user')(user);
                build.fetch(count.next);
              });
              dockerMockEvents.emitBuildComplete(cv);      
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
      // instead of polling for deployed, hook into redis events?
      instance.deployed(function (err, deployed) {
        if (err) {
          cb(err);
        }
        else if (!deployed) {
          setTimeout(function () {
            fetchInstanceAndCheckContainers();
          }, 50);
        }
        else {
          instance.fetch(function (err) {
            cb(err, instance);
          });
        }
      });
    }
  },

  createContextPath: function (user, contextId) {
    debug('createContextPath', formatArgs(arguments));
    return user
      .newContext(contextId);
  },

  createContextVersionPath: function (user, contextId, contextVersionId) {
    debug('createContextVersionPath', formatArgs(arguments));
    return user
      .newContext(contextId)
      .newVersion(contextVersionId);
  },

  createContainerPath: function (user, instanceId, containerId) {
    debug('createContainerPath', formatArgs(arguments));
    return user
      .newInstance(instanceId)
      .newContainer(containerId);
  }
};
