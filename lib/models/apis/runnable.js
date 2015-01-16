'use strict';

// var debug = require('debug')('runnable-api:models:runnable');
var async = require('async');
var util = require('util');
var ExpressRequest = require('express-request');
var RunnableUser = require('runnable');
var Base = require('runnable/lib/models/base');
var debug = require('debug')('runnable-api:runnable:model');
var error = require('error');
var Boom = require('dat-middleware').Boom;

var isFunction = require('101/is-function');

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
  this.createSetting({owner: owner}, cb);
};

Runnable.prototype.destroyInstances = function (instances, cb) {
  debug('destroyInstances', formatArgs(arguments));
  var self = this;
  async.each(instances, function (instance, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser);
    newSelf.newInstance(instance.shortHash).redeploy(cb);
  }, cb);
};

Runnable.prototype.copyInstance = function (build, parentInstance, newProps, cb) {
  debug('copyInstance', formatArgs(arguments));
  if (newProps === 'body') {
    // we are using all the stuff from parentInstance and letting it gen a new name
    newProps = {}; // just for sanity
  }
  var body = {
    parent: parentInstance.shortHash,
    env: parentInstance.env,
    owner: parentInstance.owner,
    build: build.toJSON()._id
  };
  // little bit of sanity checking for props
  var newName = newProps.name;
  if (newName && newName !== '') {
    body.name = newName;
  }
  var env = newProps.env;
  if (env && Array.isArray(env)) {
    body.env = env;
  }
  // Calling out to the API to fetch the project and env, then create a new Build
  this.createInstance(body, cb);
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

Runnable.prototype.addAppCodeVersionsToContextVersion =
  function (appCodeVersions, contextVersion, cb) {
    debug('addAppCodeVersionsToContextVersion', formatArgs(arguments));
    var self = this;
    async.forEach(appCodeVersions, function (appCodeVersion, cb) {
      var newSelf = new Runnable(self.headers, self.sessionUser);
      newSelf
        .newContext(contextVersion.context)
        .newVersion({
          _id: contextVersion._id,
          context: contextVersion.context
        })
        .createAppCodeVersion(appCodeVersion, cb);
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

Runnable.prototype.waitForInstanceDeployed = function (shortHash, cb) {
  var self = this;
  var retries = 0;
  var maxRetries = 25;
  var maxDeployTime = 5000;
  checkDeployed();
  function checkDeployed () {
    self.newInstance(shortHash)
      .deployed(function (err, body) {
        if (err) {
          cb(err);
        }
        else if (body) {
          // deployed!
          cb(null, true);
        }
        else if (retries > maxRetries) {
          error.log(Boom.badImplementation('Wait for instance deployment timed out'));
          cb(null, false);
        }
        else {
          // retry
          retries++;
          setTimeout(checkDeployed, maxDeployTime/maxRetries);
        }
      });
  }
};


function formatArgs (args) {
  var isFunction = require('101/is-function');
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (arg && arg._id || arg);
    });
}
