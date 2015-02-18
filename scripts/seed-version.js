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
  function (cb) {
    User.updateByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, {
      $set: {
        permissionLevel: 5
      }
    }, function (err) {
      cb(err);
    });
  },
  function (cb) {
    User.findByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, userData) {
      ctx.user = user.githubLogin(userData.accounts.github.accessToken, function (err) {
        cb(err);
      });
    });
  },
  createBlankSourceContext,
  createFirstSourceContext
], function (err) {
  console.log('done');
  if (err) { console.error(err); }
  process.exit(err ? 1 : 0);
});

var createdBy = {
  github: process.env.HELLO_RUNNABLE_GITHUB_ID
};


function createBlankSourceContext (thisCb) {
  async.waterfall([
    function (cb) {
      Context.findOne({'name': 'Blank', 'isSource': true}, function (err, doc) {
        if (err) { return cb(err); }
        if (doc) {
          console.log('Context (blank)');
          ctx.blankIcv = doc.infraCodeVersion;
          thisCb();
        }
        else {
          console.log('newContext (blank)');
          var context = new Context({
            owner: createdBy,
            name: 'Blank',
            description: 'An empty template!',
            isSource: true
          });
          context.save(function (err, doc) {
            cb(err, doc);
          });
        }
      });
    },
    function newICV (context, cb) {
      console.log('newICV (blank)');
      var icv = new InfraCodeVersion({
        context: context._id
      });
      async.series([
        icv.initWithDefaults.bind(icv),
        icv.save.bind(icv),
        icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: '# Empty Dockerfile!\n' })
      ], function (err) { cb(err, context, icv); });
    },
    function (context, icv, cb) {
      ctx.blankIcv = icv._id;
      cb(null, context, icv);
    },
    newCV
  ], thisCb);
}

/**
 * This will create everything for each source context.  It takes the list at the bottom, and
 * generates source contexts for them, and makes the dockerfile.  Then it creates an instance
 * for them so they can be accessed for editing by anyone logging into the HelloRunnable user.
 * @param finalCB
 */
function createFirstSourceContext(finalCB) {
  var parallelFunctions = sources.map(function (model) {
    return function (thisCb) {
      async.waterfall([
        function (cb) {
          Instance.find({
            'lowerName': (((model.isTemplate) ? 'TEMPLATE_' : '') + model.name).toLowerCase(),
            'owner': createdBy
          }, function (err, docs) {
            if (docs && docs.length) {
              // If it already exists, just skip them
              return thisCb();
            }
            console.log('REMOVING existing instance for (', model.name, ')');
            if (err) { return cb(err); }
            async.each(docs, function (doc, cb) {
              console.log('REMOVING INSTANCES', docs);
              doc.remove(next);
            }, next);
          });
          function next (err) {
            cb(err);
          }
        },
        function (cb) {
          if (model.isTemplate) {
            return cb();
          }
          Context.find({
            'lowerName': (model.name).toLowerCase(),
            'owner': createdBy
          }, function (err, docs) {
            console.log('REMOVING existing context for (', model.name, ')');
            if (err) { return cb(err); }
            async.each(docs, function (doc, cb) {
              doc.remove(cb);
            }, cb);
          });
        },
        function newContext(cb) {
          console.log('newContext (', model.name, ')');
          var context = new Context({
            owner: createdBy,
            name: model.name,
            description: 'The most awesome dockerfile, EVER',
            isSource: model.isTemplate
          });
          context.save(function (err, context, count) {
            cb(err, context, count);
          });
        },
        function newICV(context, count, cb) {
          console.log('newICV (', model.name, ')');
          var icv = new InfraCodeVersion({
            context: context._id,
            parent: ctx.blankIcv
          });
          async.series([
            icv.initWithDefaults.bind(icv),
            icv.save.bind(icv),
            icv.createFs.bind(icv, {name: 'Dockerfile', path: '/', body: model.body}),
          ], function (err) {
            cb(err, context, icv);
          });
        },
        newCV,
        createBuild,
        buildBuild,
        createInstance
      ], thisCb);
    };
    function createBuild(version, cb) {
      console.log('createBuild (', model.name, ')');
      var build = ctx.user.createBuild({
        contextVersions: [version._id],
        owner: createdBy
      }, function (err) {
        cb(err, build);
      });
    }

    function buildBuild(build, cb) {
      console.log('buildBuild (', model.name, ')');
      build.build({message: 'seed instance script', noCache: true}, function (err) {
        setTimeout(function () {
          cb(err, build);
        }, 500);
      });
    }

    function createInstance(build, cb) {
      console.log('createInstance (', model.name, ')');
      ctx.user.createInstance({
        build: build.id(),
        name: ((model.isTemplate) ? 'TEMPLATE_' : '') + model.name,
        owner: createdBy
      }, function (err) {
        if (err) {
          throw err;
        }
        console.log('DONE (', model.name, ')');
        cb();
      });
    }

  });

  async.series(parallelFunctions, finalCB);
}

function newCV (context, icv, cb) {
  console.log('newCV');
  var d = new Date();
  var cv = new ContextVersion({
    createdBy: createdBy,
    context: context._id,
    created: d,
    infraCodeVersion: icv._id
  });
  cv.save(function (err, version) {
    cb(err, version);
  });
}
var sources = [{
  name: 'PHP',
  isTemplate: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/php').toString()
}, {
  name: 'NodeJs',
  isTemplate: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/nodejs').toString()
}, {
  name: 'Rails',
  isTemplate: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/rails').toString()
}, {
  name: 'Ruby',
  isTemplate: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/ruby').toString()
}, {
  name: 'Python',
  isTemplate: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/python').toString()
}, {
  name: 'PostgreSQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/postgresSql').toString()
}, {
  name: 'MySQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mysql').toString()
}, {
  name: 'MongoDB',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/mongo/tags/manage/\n'+
  'FROM mongo:2.8.0\n'
}, {
  name: 'Redis',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/redis/tags/manage/\n'+
  'FROM redis:2.8.9\n'
}, {
  name: 'ElasticSearch',
  body: '# Full details of this base image can be found here: https://registry.hub.docker.com/u/dockerfile/elasticsearch/\n'+
  'FROM dockerfile/elasticsearch\n'
}, {
  name: 'Nginx',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/nginx/tags/manage/\n'+
  'FROM nginx:1.7.9\n'
}, {
  name: 'RabbitMQ',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/rabbitmq/tags/manage/\n'+
  'FROM rabbitmq:3.4.2\n'
}];
