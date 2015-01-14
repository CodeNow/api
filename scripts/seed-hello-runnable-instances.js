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
  github: 10224339
};

mongoose.connect(process.env.MONGO);
console.log('process.env.MONGO\n', process.env.MONGO);

async.series([
  ensureMongooseIsConnected,
  function (cb) { ctx.user = user.githubLogin(process.env.GH_TOKEN || 'f914c65e30f6519cfb4d10d0aa81e235dd9b3652', cb); },
  createContexts,
], function (err) {
  console.log(err, 'done');
  process.exit(1);
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
      console.log('newContext (blank)');
      var context = new Context({
        owner: createdBy,
        name: 'Blank',
        description: 'An empty template!',
        isSource: true
      });
      context.save(cb);
    },
    function newICV (context, count, cb) {
      console.log('newICV (blank)');
      var icv = new InfraCodeVersion({
        context: context._id
      });
      async.series([
        icv.initWithDefaults.bind(icv),
        icv.save.bind(icv),
        icv.createFs.bind(icv, {
          body: 'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          name: 'Dockerfile',
          path: '/'
        })
      ], function (err) {
        cb(err, context, icv);
      });
    },
    function newBuild (context, icv, cb) {
      console.log('new build');
      console.log(arguments);
      var build = ctx.user.createBuild(function (err) {
        console.log('err', err);
        cb(err, build, context, icv);
      });
    },
    function newCV (build, context, icv, cb) {
      console.log('newCV');
      var contextModel = ctx.user.newContext(context.id);
      var cv = contextModel.createVersion({
        qs: {
          toBuild: build.id()
        }
      }, function (err) {
        cb(err, cv, build, contextModel, icv);
      });
    },
    function (cv, build, context, icv, cb) {
      console.log('copyFilesFromSource');
      cv.copyFilesFromSource(icv, function (err) {
        cb(err, cv, build, context, icv);
      });
    },
    function (cv, build, context, icv, cb) {
      console.log('build.build');
      build.build({ message: 'seed instance script' }, function (err) {
        cb(err, cv, build, context, icv);
      });
    },
    function (cv, build, context, icv, cb) {
      async.whilst(
        function () {
          return build && !(build.json().completed || build.json().erroredContextVersions.length);
        },
        function (cb) {
          build.fetch(cb);
        },
        function (err) {
          cb(err, cv, build, context, icv);
        }
      );
    },
    function (cv, build, context, icv, cb) {
      console.log('create instance');
      var instance = ctx.user.createInstance({json: {
        build: build.id(),
        name: 'mongodb'
      }}, function (err) {
        console.log('instance', instance);
        cb(err);
      });
    }
  ], cb);
}
