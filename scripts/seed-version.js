/*
 * This script should be run whenever the database needs to be repopulated with
 * the seed contexts
 * `NODE_ENV=development NODE_PATH=./lib node scripts/seed-version.js`
 *
 * NOTE: This script will attempt to delete any existing source contexts, as well as their
 * instances.  It should output what it's deleting, so be sure to verify nothing else was targeted
 *
 */

'use strict';

require('loadenv')();

var fs = require('fs');
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');
var async = require('async');
var Runnable = require('runnable');
var user = new Runnable(process.env.FULL_API_DOMAIN);
var mongoose = require('mongoose');
var sources = [{
  name: 'PHP',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/php').toString()
}, {
  name: 'NodeJs',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/nodejs').toString()
}, {
  name: 'Rails',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/rails').toString()
}, {
  name: 'Ruby',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/ruby').toString()
}, {
  name: 'Python',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/python').toString()
}, {
  name: 'PostgreSQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/postgresSql').toString()
}, {
  name: 'MySQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mysql').toString()
}, {
  name: 'MongoDB',
  body:
    '# Full list of versions available here:'+
    ' https://registry.hub.docker.com/_/mongo/tags/manage/\n'+
    'FROM mongo:2.8.0\n'
}, {
  name: 'Redis',
  body:
    '# Full list of versions available here:'+
    ' https://registry.hub.docker.com/_/redis/tags/manage/\n'+
    'FROM redis:2.8.9\n'
}, {
  name: 'ElasticSearch',
  body:
    '# Full details of this base image can be found here:'+
    ' https://registry.hub.docker.com/u/dockerfile/elasticsearch/\n'+
    'FROM dockerfile/elasticsearch\n'
}, {
  name: 'Nginx',
  body:
    '# Full list of versions available here:'+
    ' https://registry.hub.docker.com/_/nginx/tags/manage/\n'+
    'FROM nginx:1.7.9\n'
}, {
  name: 'RabbitMQ',
  body:
    '# Full list of versions available here:'+
    ' https://registry.hub.docker.com/_/rabbitmq/tags/manage/\n'+
    'FROM rabbitmq:3.4.2\n'
}];
var createdBy = { github: process.env.HELLO_RUNNABLE_GITHUB_ID };



var ctx = {};


/*
 * START SCRIPT
 */
main();

function main () {
  connectAndLoginAsHelloRunnable(function (err) {
    if (err) {
      console.error('hello runnable error', err);
      return process.exit(err ? 1 : 0);
    }
    createAllSources();
  });
}

/*
 * CONNECT AND LOGIN
 */
function connectAndLoginAsHelloRunnable (cb) {
  mongoose.connect(process.env.MONGO);
  async.series([
    ensureMongooseIsConnected,
    makeHelloRunnableAdmin,
    loginAsHelloRunnable,
  ], cb);

}
function ensureMongooseIsConnected (cb) {
  console.log('ensureMongooseIsConnected');
  if (mongoose.connection.readyState === 1) {
    cb();
  }
  else {
    mongoose.connection.once('connected', cb);
  }
}
function makeHelloRunnableAdmin (cb) {
  console.log('makeHelloRunnableAdmin');
  var $set = { permissionLevel: 5 };
  User.updateByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, { $set: $set }, cb);
}
function loginAsHelloRunnable (cb) {
  console.log('loginAsHelloRunnable');
  User.findByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, userData) {
    if (err) { return cb(err); }
    ctx.user = user.githubLogin(userData.accounts.github.accessToken, cb);
  });
}

/*
 * CREATE SEED DATA
 */
function createAllSources () {
  async.series([
    createBlankSource,
    createOtherSources
  ], function (err) {
    if (err) {
      console.error('create sources error', err);
    }
    else {
      console.log('done');
      process.exit(0);
    }
  });
}
function createBlankSource (done) {
  console.log('createBlankSourceContext');
  var blankData = { 'name': 'Blank', 'isSource': true };
  async.waterfall([
    doneIfExistingContextFound(blankData, done),
    createContext(blankData),
    createICV,
    function (context, icv, cb) {
      ctx.blankIcv = icv._id;
      cb(null, blankData, context, icv);
    },
    createCV
  ], done);
}
function createOtherSources (cb) {
  async.forEach(sources, createSource, cb);
}
function createSource (source, done) {
  async.waterfall([
    doneIfExistingInstanceFound(source, done),
    doneIfExistingContextFound(source, done),
    createContext(source),
    createICV,
    createCV,
    createBuild,
    buildBuild,
    createInstance
  ], done);
}
function doneIfExistingInstanceFound (data, done) {
  return function (cb) {
    Instance.find({
      'lowerName': (((data.isTemplate) ? 'TEMPLATE_' : '') + data.name).toLowerCase(),
      'owner': createdBy
    }, function (err, docs) {
      if (err) { return cb(err); }
      if (docs && docs.length) {
        return done(); // if exists.. done. don't continue
      }
      cb();
    });
  };
}
function doneIfExistingContextFound (data, done) {
  return function (cb) {
    console.log('findOrCreateContext');
    Context.findOne({ 'name': data.name, 'isSource': data.isSource }, function (err, context) {
      if (err) { return cb(err); }
      if (context) {
        console.log('Existing "'+data.name+'" context found');
        return done(); // Source already exists. Just call done.
      }
      cb(); // continue
    });
  };
}
function createContext (data) {
  return function (cb) {
    console.log('Create Context "'+data.name+'"');
    var context = new Context({
      owner: createdBy,
      name: data.name,
      description: data.name,
      isSource: data.isSource
    });
    context.save(function (err, context) {
      cb(err, data, context);
    });
  };
}
function createICV (data, context, cb) {
  console.log('createICV "'+data.name+'"');
  var icv = new InfraCodeVersion({
    context: context._id
  });
  async.series([
    icv.initWithDefaults.bind(icv),
    icv.save.bind(icv),
    icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: data.body })
  ], function (err) {
    cb(err, data, context, icv);
  });
}
function createCV (data, context, icv, cb) {
  console.log('newCV');
  var cv = new ContextVersion({
    createdBy: createdBy,
    context  : context._id,
    created  : new Date(),
    infraCodeVersion: icv._id
  });
  cv.save(function (err, version) {
    cb(err, data, version);
  });
}
function createBuild(data, version, cb) {
  console.log('createBuild (', data.name, ')');
  var build = ctx.user.createBuild({
    contextVersions: [version._id],
    createdBy: createdBy,
    owner    : createdBy // same on purpose
  }, function (err) {
    cb(err, data, build);
  });
}
function buildBuild(data, build, cb) {
  console.log('buildBuild (', data.name, ')');
  build.build({message: 'seed instance script', noCache: true}, function (err) {
    setTimeout(function () {
      cb(err, data, build);
    }, 500);
  });
}
function createInstance(data, build, cb) {
  console.log('createInstance (', data.name, ')');
  ctx.user.createInstance({
    build: build.id(),
    name: ((data.isTemplate) ? 'TEMPLATE_' : '') + data.name,
    owner: createdBy
  }, function (err) {
    console.log('Created Instance (done) (', data.name, ')', err);
    cb(err);
  });
}