'use strict';

// var debug = require('debug')('runnable-api:models:runnable');
var async = require('async');
var util = require('util');
var ExpressRequest = require('express-request');
var RunnableUser = require('runnable');
var Base = require('runnable/lib/models/base');
Base.prototype.parse = function (attrs) {
  if (attrs.toJSON) {
    attrs = attrs.toJSON();
  }
  this.attrs = attrs;
};

// var Boom = require('dat-middleware').Boom;
var RunnableUser;


module.exports = Runnable;

function Runnable (headers, sessionUser) {
  // FIXME: change to process.env, also have full address in config
  var app = require('app');
  var host = 'http://api.'+process.env.DOMAIN;
  var opts = {};
  if (headers) {
    opts.requestOpts = {
      headers: headers
    };
  }
  if (sessionUser) {
    var User = require('models/mongo/user');
    if (!sessionUser.toJSON) {
      sessionUser = new User(sessionUser);
    }
    opts.requestOpts = opts.requestOpts || {};
    opts.requestOpts.req = {
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

Runnable.prototype.shallowCopyBuild = function (build, cb) {
  var body = {
    parentBuild: build.toJSON()._id,
    shallow: true
  };
  var newBuild = this
    .newProject(build.project.toString())
    .newEnvironment(build.environment.toString())
    .createBuild(body, function (err) {
      cb(err, newBuild);
    });
};

Runnable.prototype.copyBuildWithSameInfra = function (build, contextVersionsToUpdate, cb) {
  var body = {
    parentBuild: build.toJSON()._id,
    shallow: true,
    contextVersionsToUpdate: contextVersionsToUpdate
  };
  var newBuild = this
    .newProject(build.project.toString())
    .newEnvironment(build.environment.toString())
    .createBuild(body, function (err) {
      cb(err, newBuild);
    });
};

Runnable.prototype.copyBuildsWithSameInfra = function (builds, contextVersionsToUpdate, cb) {
  var self = this;
  async.map(builds, function (build, cb) {
    self.copyBuildWithSameInfra(build, contextVersionsToUpdate, cb);
  }, cb);
};

Runnable.prototype.buildBuilds = function (builds, body, cb) {
  if (builds.toJSON) { builds = builds.toJSON(); }
  if (builds[0] && builds[0].toJSON) {
    builds = builds.map(function (build) {
      return build.toJSON();
    });
  }
  var self = this;
  async.forEach(builds, function (build, cb) {
    self.buildBuild(build, body, cb);
  }, cb);
};

Runnable.prototype.buildBuild = function (build, body, cb) {
  if (build.toJSON) { build = build.toJSON(); }
  var buildModel = this
    .newProject(build.project.toString())
    .newEnvironment(build.environment.toString())
    .newBuild(build._id.toString());
  buildModel.build({
    json: body
  }, cb);
};