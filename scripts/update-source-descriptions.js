/*
 * This script should be run whenever the database needs to be repopulated with
 * the seed contexts
 * `NODE_ENV=development NODE_PATH=./lib node scripts/seed-version.js`
 *
 * NOTE: This script will attempt to delete any existing source contexts, as well as their
 * instances.  It should output what it's deleting, so be sure to verify nothing else was targeted
 *
 * NOTE 2: Must log in as HelloRunnable and populate user model in mongo before running this script
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
  description: 'An object-relational database management system',
  body: fs.readFileSync('./scripts/sourceDockerfiles/postgresSql').toString()
}, {
  name: 'MySQL',
  description: 'Relational database management system',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mysql').toString()
}, {
  name: 'MongoDB',
  description: 'A cross-platform document-oriented database',
  body: '# Full list of versions available here:' +
  ' https://registry.hub.docker.com/_/mongo/tags/manage/\n' +
  'FROM mongo:2.8.0\n'
}, {
  name: 'Redis',
  description: 'A data structure server',
  body: '# Full list of versions available here:' +
  ' https://registry.hub.docker.com/_/redis/tags/manage/\n' +
  'FROM redis:2.8.9\n'
}, {
  name: 'ElasticSearch',
  description: 'Search and analyze data in real time',
  body: '# Full details of this base image can be found here:' +
  ' https://registry.hub.docker.com/u/dockerfile/elasticsearch/\n' +
  'FROM dockerfile/elasticsearch\n'
}, {
  name: 'Nginx',
  description: 'High-performance load balancer and application accelerator',
  body: '# Full list of versions available here:' +
  ' https://registry.hub.docker.com/_/nginx/tags/manage/\n' +
  'FROM nginx:1.7.9\n'
}, {
  name: 'RabbitMQ',
  description: 'Robust messaging for applications',
  body: '# Full list of versions available here:' +
  ' https://registry.hub.docker.com/_/rabbitmq/tags/manage/\n' +
  'FROM rabbitmq:3.4.2\n'
}, {
  name: 'Cassandra',
  description: 'Open source distributed database management system'
}, {
  name: 'HBase',
  description: 'Hadoop database, a distributed, scalable, big data store'
}, {
  name: 'Memcached',
  description: 'A general-purpose distributed memory caching system'
}];
var createdBy = {github: process.env.HELLO_RUNNABLE_GITHUB_ID};


var ctx = {};


/*
 * START SCRIPT
 */
main();

function main() {
  connectAndLoginAsHelloRunnable(function (err) {
    if (err) {
      console.error('hello runnable error', err);
      return process.exit(err ? 1 : 0);
    }
    createOtherSources();
  });
}

/*
 * CONNECT AND LOGIN
 */
function connectAndLoginAsHelloRunnable(cb) {
  mongoose.connect(process.env.MONGO);
  async.series([
    ensureMongooseIsConnected,
    makeHelloRunnableAdmin,
    loginAsHelloRunnable,
  ], cb);

}
function ensureMongooseIsConnected(cb) {
  console.log('ensureMongooseIsConnected');
  if (mongoose.connection.readyState === 1) {
    cb();
  }
  else {
    mongoose.connection.once('connected', cb);
  }
}
function makeHelloRunnableAdmin(cb) {
  console.log('makeHelloRunnableAdmin');
  var $set = {permissionLevel: 5};
  User.updateByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, {$set: $set}, cb);
}
function loginAsHelloRunnable(cb) {
  console.log('loginAsHelloRunnable');
  User.findByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, userData) {
    if (err) {
      return cb(err);
    }
    ctx.user = user.githubLogin(userData.accounts.github.accessToken, cb);
  });
}


function createOtherSources(cb) {
  async.forEach(sources, updateDescriptions, cb);
}

function updateDescriptions(data, done) {
  if (data.description) {

  }
  console.log('updating description for ', data.name);
  Context.findOneAndUpdate({'name': data.name, 'isSource': data.isSource}, {
    $set: {
      description: data.description
    }
  }, done);
}