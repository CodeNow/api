'use strict';

// var debug = require('debug')('runnable-api:models:runnable');

var util = require('util');
var ExpressRequest = require('express-request');

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
      isFromApi: true,
      sessionUser: sessionUser,
      session: {
        cookie: {},
        passport: {
          user: '123456789012345678901234'
        }
      }
    };
  }
  RunnableUser.call(this, host, opts);
  this.client.request = new ExpressRequest(app);
  this.client.request.defaults(opts.requestOpts);
}

process.nextTick(function () { // circular requires
  RunnableUser = require('runnable');

  util.inherits(Runnable, RunnableUser);

  Runnable.prototype.buildBuild = function (build, buildData, cb) {
    var buildModel = this
      .newProject(build.project.toString())
      .newEnvironment(build.environment.toString())
      .newBuild(build._id.toString());
    buildModel.build({
      json: buildData
    }, cb);
  };
});
