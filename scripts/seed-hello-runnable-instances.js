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

var createdBy = {
  github: process.env.HELLO_RUNNABLE_GITHUB_ID
};

mongoose.connect(process.env.MONGO);

async.series([
  ensureMongooseIsConnected,
  createContexts,

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



function ensureMongooseIsConnected (cb) {
  console.log('ensure');
  if (mongoose.connection.readyState === 1) {
    cb();
  }
  else {
    mongoose.connection.once('connected', cb);
  }
}

function createContexts (cb) {
  async.waterfall([
    function newContext (cb) {
      var context = new Context({
        owner: createdBy,
        name: 'mongodb',
        description: 'mongodb',
        isSource: false
      });
      context.save(cb);
    },
    function newICV (context, count, cb) {
      var icv = new InfraCodeVersion({
        context: context._id
      });
      async.series([
        icv.initWithDefaults.bind(icv),
        icv.save.bind(icv),
        icv.createFs.bind(icv, {
          name: 'Dockerfile',
          path: '/',
          body: 'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n'
        }),
      ], function (err) {
        cb(err, context, icv);
      });
    },
    function newCV (context, icv, cb) {
      console.log('newCV');
      var d = new Date();
      var cv = new ContextVersion({
        createdBy: createdBy,
        context: context._id,
        project: context._id,
        environment: context._id,
        infraCodeVersion: icv._id,
        build: {
          started: d,
          completed: d
        }
      });
      cv.save(cb);
    }
  ], cb);
}
