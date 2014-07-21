'use strict';

require('loadenv')();
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var async = require('async');
var mongoose = require('mongoose');

mongoose.connect(process.env.MONGO);
createFirstSourceContext();

var createdBy = { github: 160236 };

function createFirstSourceContext () {

  async.waterfall([
    function ensureMongooseIsConnected (cb) {
      console.log('ensure');
      if (mongoose.connection.readyState === 1) {
        cb();
      }
      else {
        mongoose.connection.once('connected', cb);
      }
    },
    function newContext (cb) {
      console.log('newContext');
      var context = new Context({
        owner: createdBy,
        name: 'NodeJS',
        description: 'The most awesome node, EVER',
        isSource: true
      });
      context.save(cb);
    },
    function newICV (context, count, cb) {
      console.log('newICV');
      var icv = new InfraCodeVersion({
        context: context._id
      });
      async.series([
        icv.initWithDockerfile.bind(icv, 'FROM dockerfile/nodejs\n'),
        icv.save.bind(icv)
      ], function (err) { cb(err, context, icv); });
    },
    function newCV (context, icv, cb) {
      console.log('newCV');
      var cv = new ContextVersion({
        createdBy: createdBy,
        context: context._id,
        environment: context._id,
        infraCodeVersion: icv._id
      });
      cv.save(cb);
    },
  ], function (err) {
    console.log('done');
    if (err) { console.error(err); }
    process.exit(err ? 1 : 0);
  });

}
