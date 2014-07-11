'use strict';

// var debug = require('debug')('runnable-api:models:runnable');

var util = require('util');
var configs = require('configs');
var ExpressRequest = require('express-request');

// var Boom = require('dat-middleware').Boom;
var RunnableUser;


module.exports = Runnable;

function Runnable (headers) {
  // FIXME: change to process.env, also have full address in config
  var app = require('app');
  var host = 'http://api.'+configs.domain;
  var opts = {
    requestOpts: {
      headers: headers
    }
  };
  RunnableUser.call(this, host, opts);
  this.client.request = new ExpressRequest(app);
}

process.nextTick(function () { // circular requires
  RunnableUser = require('runnable');

  util.inherits(Runnable, RunnableUser);

  Runnable.prototype.buildBuild = function (build, cb) {
    var buildModel = this
      .newProject(build.project)
      .newEnvironment(build.environment)
      .newBuild(build._id);

    buildModel.build(cb);
  };
});
