/**
 * For API requests initiated within API routes
 * @module lib/models/apis/runnable
 */
'use strict';

// var debug = require('debug')('runnable-api:models:runnable');
var Base = require('runnable/lib/models/base');
var ExpressRequest = require('express-request');
var RunnableUser = require('runnable');
var async = require('async');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:runnable:model');
var formatArgs = require('format-args');
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var util = require('util');
var dogstatsd = require('models/datadog');
var ContextVersion = require('models/mongo/context-version');


Base.prototype.parse = function (attrs) {
  if (attrs.toJSON) {
    attrs = attrs.toJSON();
  }
  attrs = JSON.parse(JSON.stringify(attrs));
  return attrs;
};

module.exports = Runnable;

function Runnable (headers, sessionUser) {
  this.headers = headers;
  var app = require('express-app');
  var host = process.env.FULL_API_DOMAIN;
  var opts = {};
  if (headers) {
    opts.requestOpts = {
      headers: headers
    };
  }
  if (sessionUser) {
    this.sessionUser = sessionUser;
    var User = require('models/mongo/user');
    if (!sessionUser.toJSON) {
      sessionUser = new User(sessionUser);
    }
    opts.requestOpts = opts.requestOpts || {};
    opts.requestOpts.req = {
      connection: { requestAddress: '127.0.0.1' },
      isInternalRequest: true,
      sessionUser: sessionUser,
      session: {
        cookie: {},
        passport: {
          user: sessionUser._id
        }
      }
    };
  }
  RunnableUser.call(this, host, opts);
  this.client.request = new ExpressRequest(app);
  this.client.request.defaults(opts.requestOpts);
}

util.inherits(Runnable, RunnableUser);

/**
 * This calls the deploy route of a given instances
 * @param instances
 * @param cb
 */
Runnable.prototype.deployInstance = function (instance, opts, cb) {
  debug('deployInstance', formatArgs(arguments));
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  var instanceModel = this.newInstance(instance.shortHash);
  instanceModel.deploy(opts, cb);
};

/**
 * This calls the deploy route of a given instances and retries up-to 15 times in case of conflict
 * @param instances
 * @param cb
 */
Runnable.prototype.deployInstanceWithRetry = function (instance, opts, cb) {
  debug('deployInstanceWithRetry', formatArgs(arguments));
  var self = this;
  var retries = 0;
  var maxRetries = 15;
  deploy();
  function deploy () {
    self.deployInstance.call(self, instance, opts, function (err, deployed) {
      if (err) {
        if (err.output.statusCode === 409) {
          setTimeout(function () {
            attemptRetry(err);
          }, 250);
          return;
        }
        cb(err); // real error
      }
      else {
        cb(null, deployed);
      }
    });
  }
  function attemptRetry (err) {
    if (retries > maxRetries) {
      return cb(err);
    }
    retries++;
    return deploy();
  }
};

var origUpdateInstance = Runnable.prototype.updateInstance;
Runnable.prototype.updateInstance = function (id, opts, cb) {
  debug('updateInstance', formatArgs(arguments));
  var self = this;
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  var retries = 0;
  var maxRetries = 15;
  update();
  function update () {
    origUpdateInstance.call(self, id, opts, function (err) {
      if (err) {
        if (err.output.statusCode === 409 &&
          /try again after a few seconds/.match(err.output.message)) {
          // only attempt retries if buildId is provided
          setTimeout(function () {
            attemptRetry(err);
          }, 250);
          return;
        }
        cb(err); // real error
      }
      else {
        cb.apply(null, arguments);
      }
    });
  }
  function attemptRetry (err) {
    if (retries > maxRetries) {
      return cb(err);
    }
    retries++;
    return update();
  }
};

Runnable.prototype.createEmptySettings = function (owner, cb) {
  debug('createEmptySettings', formatArgs(arguments));
  this.createSetting({ owner: owner }, cb);
};

/**
 * Destroy instances.
 * @param {Array} instances  array of instances to be deleted
 * @param {Function} cb      standard callback
 */
Runnable.prototype.destroyInstances = function (instances, cb) {
  debug('destroyInstances', formatArgs(arguments));
  async.each(instances, function (instance, iterCb) {
    var iterRunnable = new Runnable(this.headers, this.sessionUser);
    iterRunnable.newInstance(instance.shortHash).destroy(iterCb);
  }.bind(this), cb);
};

Runnable.prototype.copyInstance = function (sessionUser, build, parentInstance, body, cb) {
  debug('copyInstance', formatArgs(arguments));
  body.parent = parentInstance.shortHash;
  body.build = build.toJSON()._id;
  body.env = body.env || parentInstance.env;
  body.owner = body.owner || parentInstance.owner;
  body.masterPod = body.masterPod || parentInstance.masterPod;
  // Calling out to the API to fetch the project and env, then create a new Build
  this.createInstance(body, cb);
};

/**
 * Fork master instance with the new `build` and for the specific `user`.
 * **Automatic** handling of instance duplicate name.
 * @param {Object} masterInst     master instance to be forked
 * @param {String} buildId        id of the build that should be on the new instance
 * @param {String} branch         branch name that will be appended to the name of the new instance
 * @param {Function} cb           standard callback - (err, forkedInstance)
 */
Runnable.prototype.forkMasterInstance = function (masterInst, buildId, branch, cb) {
  debug('forkMasterInstance', formatArgs(arguments));
  // basically only letters, numbers and - are allowed in domain names
  var sanitizedBranch = branch.replace(/[^a-zA-Z0-9]/g, '-');
  var body = {
    parent: masterInst.shortHash,
    build: buildId,
    name: sanitizedBranch + '-' + masterInst.name,
    env:  masterInst.env,
    owner: {
      github: masterInst.owner.github
    },
    masterPod: false,
    autoForked: true
  };
  var tags = [
    'env:' + process.env.NODE_ENV
  ];
  this.createInstance(body, function (err, instance) {
    if (err) {
      var errMsg = keypather.get(err, 'output.payload.message');
      if (err.output.statusCode === 409 && errMsg === 'instance with lowerName already exists') {
        // retry and append suffix to the parent instance name
        masterInst.name = masterInst.name + '-1';
        this.forkMasterInstance(masterInst, buildId, sanitizedBranch, cb);
        dogstatsd.increment('api.runnable.fork_master_instance.conflict', 1, tags);
      }
      else {
        cb(err);
        dogstatsd.increment('api.runnable.fork_master_instance.error', 1, tags);
      }
    }
    else {
      cb(null, instance);
      dogstatsd.increment('api.runnable.fork_master_instance.success', 1, tags);
    }
  }.bind(this));
};

Runnable.prototype.shallowCopyBuild = function (build, cb) {
  debug('shallowCopyBuild', formatArgs(arguments));
  var body = {
    parentBuild: build.toJSON()._id,
    shallow: true
  };
  // Calling out to the API to fetch the project and env, then create a new Build
  var newBuild = this.createBuild(body, function (err) {
    cb(err, newBuild);
  });
};

Runnable.prototype.copyBuildWithSameInfra = function (build, contextVersionsToUpdate, cb) {
  debug('copyBuildWithSameInfra', formatArgs(arguments));
  var body = {
    parentBuild: build.toJSON()._id,
    shallow: true,
    contextVersionsToUpdate: contextVersionsToUpdate
  };
  var newBuild = this
    .createBuild(body, function (err) {
      cb(err, newBuild);
    });
};

Runnable.prototype.copyBuildsWithSameInfra = function (builds, contextVersionsToUpdate, cb) {
  debug('copyBuildsWithSameInfra', formatArgs(arguments));
  var self = this;
  async.mapSeries(builds, function (build, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser);
    newSelf.copyBuildWithSameInfra(build, contextVersionsToUpdate, cb);
  }, cb);
};

Runnable.prototype.buildBuild = function (build, opts, cb) {
  debug('buildBuild', formatArgs(arguments));
  if (build.toJSON) {
    build = build.toJSON();
  }
  var buildModel = this
    .newBuild(build._id.toString());
  buildModel.build(opts, cb);
 };

/**
 * Create new build and build it. Two API calls
 * @param  {String}   cvId          context version id
 * @param  {Number}   ownerGithubId github id for the new build owner
 * @param  {String}   repo          full repo name - needed for appCodeVersion
 * @param  {String}   commit        commit sha - needed for appCodeVersion
 * @param  {Function} cb            standard callback with 2 params. Return newBuild on success
 */
Runnable.prototype.createAndBuildBuild = function (cvId, ownerGithubId, repo, commit, cb) {
  debug('createAndBuildBuild', formatArgs(arguments));
  var newBuildPayload = {
    contextVersions: [cvId],
    owner: {
      github: ownerGithubId
    }
  };
  var buildBuildPayload = {
    triggeredAction: {
      manual: false,
      appCodeVersion: {
        repo: repo,
        commit: commit
      }
    }
  };
  this.createBuild({ json: newBuildPayload }, function (err, newBuild) {
    if (err) { return cb(err); }
    this.buildBuild(newBuild, { json: buildBuildPayload }, cb);
  }.bind(this));
};

Runnable.prototype.createContextVersion = function (contextId, cb) {
  debug('createContextVersion', formatArgs(arguments));
  this
    .newContext(contextId.toString())
    .createVersion(cb);
};

Runnable.prototype.copyVersionIcvFiles = function (contextId, cvId, icvId, cb) {
  debug('copyVersionIcvFiles', formatArgs(arguments));
  this
    .newContext(contextId)
    .newVersion(cvId)
    .copyFilesFromSource(icvId, cb);
};

Runnable.prototype.addAppCodeVersionsToContextVersion =
  function (appCodeVersions, contextVersion, cb) {
    debug('addAppCodeVersionsToContextVersion', formatArgs(arguments));
    var self = this;
    async.forEach(appCodeVersions, function (appCodeVersion, eachCb) {
      var newSelf = new Runnable(self.headers, self.sessionUser);
      newSelf
        .newContext(contextVersion.context)
        .newVersion({
          _id: contextVersion._id,
          context: contextVersion.context
        })
        .createAppCodeVersion(appCodeVersion, eachCb);
    }, cb);
  };

Runnable.prototype.deepCopyContextVersion = function (contextId, contextVersionId, cb) {
  debug('deepCopyContextVersion', formatArgs(arguments));
  var newCV = this
    .newContext(contextId.toString())
    .newVersion({
      _id: contextVersionId.toString(),
      context: contextId.toString()
    })
    .deepCopy(function (err) {
      cb(err, newCV);
    });
};


/**
 * Deep copy original `contextVersion` and patch it with `repoData`.
 */
Runnable.prototype.deepCopyContextVersionAndPatch = function (contextVersion, repoData, cb) {
  debug('copyAndCreateNew', formatArgs(arguments));
  this.deepCopyContextVersion(contextVersion.context, contextVersion._id,
    function (err, newCvModel) {
      if (err) { return cb(err); }
      if (!newCvModel || !newCvModel.attrs) {
        return Boom.badImplementation('New ContextVersion wasnot created');
      }
      var newContextVersion = newCvModel.attrs;
      var contextVersionId = newContextVersion._id;
      ContextVersion.modifyAppCodeVersionByRepo(contextVersionId, repoData.repo,
        repoData.branch, repoData.commit, cb);
    });
};

Runnable.prototype.deepCopyContextVersions = function (contextIds, contextVersionIds, cb) {
  debug('deepCopyContextVersions', formatArgs(arguments));
  var self = this;
  var idsArr = contextVersionIds.map(function (versionId, i) {
    return {
      contextId: contextIds[i].toString(),
      versionId: versionId.toString()
    };
  });
  async.map(idsArr, function (ids, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser);
    newSelf.deepCopyContextVersion(ids.contextId, ids.versionId, cb);
  }, cb);
};

Runnable.prototype.buildVersion = function (contextVersion, opts, cb) {
  debug('buildVersion', formatArgs(arguments));
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  var contextId = contextVersion.context.toString();
  var versionId = contextVersion._id.toString();
  var cv = this
    .newContext(contextId)
    .newVersion({
      _id: versionId,
      context: contextId
    })
    .build(opts, function (err) {
      cb(err, cv); // model id could've changed if deduped
    });
};
