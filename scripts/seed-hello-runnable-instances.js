'use strict';

require('loadenv')();
var InfraCodeVersion = require('models/mongo/infra-code-version');
var async = require('async');
var Runnable = require('runnable');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);

var user = new Runnable('http://localhost:3030');
var HELLO_RUNNABLE_ACCESS_TOKEN = "e9bdfb84960b6d6aded1910a007c2ab716571c84";
var HELLO_RUNNABLE_GITHUB_ID = 10224339;

var seedInstances = [{
  name: 'mongodb',
  Dockerfile: 'FROM ubuntu\n'
}, {
  name: 'redis',
  Dockerfile: 'From redis\n'
}];

function blockOnMongo (cb) {
  if (mongoose.connection.readyState === 1) {
    cb();
  }
  else {
    mongoose.connection.once('connected', cb);
  }
}

async.eachSeries(seedInstances, function (instanceData, cb) {
  var ctx = {};
  async.series([
    blockOnMongo,

    function authenticateUser (cb) {
      ctx.user = user.githubLogin(process.env.GH_TOKEN ||
                                  'f914c65e30f6519cfb4d10d0aa81e235dd9b3652', cb);
      //ctx.user = user.githubLogin(HELLO_RUNNABLE_ACCESS_TOKEN, cb);
    },

    function createContext (cb) {
      ctx.context = ctx.user.createContext({
        name: instanceData.name,
        owner: {
          github: HELLO_RUNNABLE_GITHUB_ID
        }
      }, cb);
    },

    function createICV (cb) {
      ctx.icv = new InfraCodeVersion({
        owner: {
          github: HELLO_RUNNABLE_GITHUB_ID
        },
        context: ctx.context.id()
      }, function (err) {
        if (err) { return cb(err); }
        async.series([
          ctx.icv.initWithDefaults.bind(ctx.icv),
          ctx.icv.save.bind(ctx.icv),
          ctx.icv.createFs.bind(ctx.icv, {
            //body: 'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
            body: instanceData.Dockerfile,
            name: 'Dockerfile',
            path: '/'
          })
        ], cb);
      });
    },

    function createVersion (cb) {
      ctx.version = ctx.context.createVersion(cb);
    },

    function createBuild (cb) {
      ctx.build = ctx.user.createBuild({
        contextVersions: [ctx.version.id()],
        owner: {
          github: HELLO_RUNNABLE_GITHUB_ID
        }
      }, cb);
    },

    function buildBuild (cb) {
      ctx.build.build({
        message: 'initial build'
      }, cb);
    },

    function createInstance (cb) {
      ctx.instance = ctx.user.createInstance({json: {
        build: ctx.build.id(),
        name: instanceData.name
      }}, cb);
    }
  ], cb);

}, function (err) {
  console.log(err);
  process.exit(0);
  console.log('awwwwwwww yeahhhhhh');
});
