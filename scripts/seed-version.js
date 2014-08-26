'use strict';

require('loadenv')();
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var async = require('async');
var mongoose = require('mongoose');

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
  createFirstSourceContext,
  createBlankSourceContext
], function (err) {
  console.log('done');
  if (err) { console.error(err); }
  process.exit(err ? 1 : 0);
});

var createdBy = { github: 160236 };

function createBlankSourceContext (cb) {
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
        icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: '# Empty Dockerfile!' })
      ], function (err) { cb(err, context, icv); });
    },
    newCV,
  ], cb);
}

function createFirstSourceContext (cb) {
  async.waterfall([
    function newContext (cb) {
      console.log('newContext (nodejs)');
      var context = new Context({
        owner: createdBy,
        name: 'NodeJS',
        description: 'The most awesome node, EVER',
        isSource: true
      });
      context.save(cb);
    },
    function newICV (context, count, cb) {
      console.log('newICV (nodejs)');
      var icv = new InfraCodeVersion({
        context: context._id
      });
      async.series([
        icv.initWithDefaults.bind(icv),
        icv.save.bind(icv),
        icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: 'FROM dockerfile/nodejs\n' }),
      ], function (err) { cb(err, context, icv); });
    },
    newCV,
  ], cb);
}

function newCV (context, icv, cb) {
  console.log('newCV');
  var d = new Date();
  var cv = new ContextVersion({
    createdBy: createdBy,
    context: context._id,
    environment: context._id,
    infraCodeVersion: icv._id,
    build: {
      started: d,
      completed: d
    }
  });
  cv.save(cb);
}
