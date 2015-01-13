'use strict';

require('loadenv')();

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var Runnable = require('runnable');
var async = require('async');
var mongoose = require('mongoose');
var user = new Runnable('localhost:3030');
var uuid = require('uuid');

var ctx = {};

mongoose.connect(process.env.MONGO);
async.series([
  function ensureMongooseIsConnected (cb) {
    console.log('ensure');
    if (mongoose.connection.readyState === 1) {
      cb();
    }
    else {
      mongoose.connection.once('connected', cb);
    }
  },
  // TIP:
  // generate new token here: https://github.com/settings/applications
  // w/ permissions: repo, user, write:repo_hook
  function (cb) { ctx.user = user.githubLogin(process.env.GH_TOKEN || 'f914c65e30f6519cfb4d10d0aa81e235dd9b3652', cb); },
  function (cb) { ctx.sourceContexts = ctx.user.fetchContexts({isSource: true}, cb); },
  function (cb) { ctx.sourceVersions = ctx.sourceContexts.models[0].fetchVersions({}, cb); },
  function (cb) { ctx.context = ctx.user.createContext({name: uuid()}, cb); },
  function (cb) { ctx.build = ctx.user.createBuild(cb); },
  function (cb) {
    ctx.contextVersion = ctx.context.createVersion({qs: {
      toBuild: ctx.build.id()
    }}, cb);
  },
  function (cb) {
    var icv = ctx.sourceVersions.models[0].json().infraCodeVersion;
    ctx.contextVersion.copyFilesFromSource(icv, cb);
  },
  function (cb) { ctx.build.build({ message: 'seed instance script' }, cb); },
  function (cb) {
    async.whilst(
      function () {
        return ctx.build &&
          !(ctx.build.json().completed || ctx.build.json().erroredContextVersions.length);
      },
      function (cb) { ctx.build.fetch(cb); },
      cb);
  },
  function (cb) {
    ctx.instance = ctx.user.createInstance({json: {
      build: ctx.build.id(),
      name: uuid()
    }}, cb);
  }
], function (err) {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    console.log('done');
  }
});
