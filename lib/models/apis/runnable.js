'use strict';

// var debug = require('debug')('runnable-api:models:runnable');
var findIndex = require('101/find-index');
var hasProps = require('101/has-properties');
var async = require('async');
var util = require('util');
var ExpressRequest = require('express-request');
var RunnableUser = require('runnable');
var Base = require('runnable/lib/models/base');
var debug = require('debug')('runnable-api:runnable:model');

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
  var app = require('app');
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
Runnable.prototype.redeployInstance = function (instance, cb) {
  debug('redeployInstance', formatArgs(arguments));
  var instanceModel = this.newInstance(instance.shortHash);
  instanceModel.redeploy(cb);
};

Runnable.prototype.destroyInstances = function (instances, cb) {
  debug('destroyInstances', formatArgs(arguments));
  var self = this;
  async.each(instances, function (instance, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser);
    newSelf.newInstance(instance.shortHash).redeploy(cb);
  }, cb);
};

Runnable.prototype.copyInstance = function (build, parentInstance, newName, cb) {
  debug('copyInstance', formatArgs(arguments));
  var body = {
    parent: parentInstance.shortHash,
    env: parentInstance.env,
    owner: parentInstance.owner,
    build: build.toJSON()._id
  };
  // this 'body.name' check is a little meta, but it's an invalid name anyway, so it's safe
  if (newName && newName !== '' && newName !== 'body.name') {
    body.name = newName;
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

Runnable.prototype.buildBuilds = function (builds, body, cb) {
  debug('buildBuilds', formatArgs(arguments));
  if (builds.toJSON) {
    builds = builds.toJSON();
  }
  if (builds[0] && builds[0].toJSON) {
    builds = builds.map(function (build) {
      return build.toJSON();
    });
  }
  var self = this;
  async.eachSeries(builds, function (build, cb) {
    var newSelf = new Runnable(self.headers, self.sessionUser);
    newSelf.buildBuild(build, body, cb);
  }, cb);
};

Runnable.prototype.buildBuild = function (build, body, cb) {
  debug('buildBuild', formatArgs(arguments));
  if (build.toJSON) {
    build = build.toJSON();
  }
  var buildModel = this
    .newBuild(build._id.toString());
  buildModel.build({
    json: body
  }, cb);
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

Runnable.prototype.updateVersionCommitForBranchAndRepo =
  function (contextVersion, repo, branch, commit, cb) {
    debug('updateVersionCommitForBranchAndRepo', formatArgs(arguments));
    var cv = this
      .newContext(contextVersion.context.toString())
      .newVersion({
        _id: contextVersion._id.toString(),
        context: contextVersion.context.toString()
      });
    var acvIndex = findIndex(contextVersion.appCodeVersions, hasProps({
      lowerRepo: repo.toLowerCase(),
      lowerBranch: branch.toLowerCase()
    }));
    if (acvIndex === -1) {
      cb(null, cv);
    } else {
      var update = {
        commit: commit
      };
      // aaaaaaalllllllllll the .toString()s (because it needs to be A STRING AAARRRGGG [angryhulk])
      var acv = cv.newAppCodeVersion(contextVersion.appCodeVersions[acvIndex]._id.toString());
      acv.update({json: update}, function (err) {
        cb(err, cv);
      });
    }
  };

Runnable.prototype.buildVersion = function (contextId, versionId, cb) {
  debug('buildVersion', formatArgs(arguments));
  var newCV = this
    .newContext(contextId.toString())
    .newVersion({
      _id: versionId.toString(),
      context: contextId.toString()
    })
    .build(function (err) {
      cb(err, newCV);
    });
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