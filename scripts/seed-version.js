'use strict';

require('loadenv')();
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var Instance = require('models/mongo/instance');
var Build = require('models/mongo/build');
var User = require('models/mongo/user');
var async = require('async');
var Runnable = require('runnable');
var user = new Runnable('localhost:3030');
var mongoose = require('mongoose');
var keypather = require('keypather')();


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
    ctx.user = user.githubLogin(process.env.GH_TOKEN || 'f914c65e30f6519cfb4d10d0aa81e235dd9b3652', function () {
      keypather.set(ctx.user, 'attrs.accounts.github.id', process.env.HELLO_RUNNABLE_GITHUB_ID);
      cb();
    });
  },
  removeCurrentSourceTemplates,
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

function removeCurrentSourceTemplates(cb) {
  Context.find({'isSource': true}, function (err, docs) {
    docs.forEach(function (doc) {
      doc.remove();
    });
    console.log(docs);
    cb();
  });
}

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
        icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: '# Empty Dockerfile!\n' })
      ], function (err) { cb(err, context, icv); });
    },
    newCV,
  ], cb);
}

function createFirstSourceContext (cb) {
  var parallelFunctions = sources.map(function (model) {
    return function (cb) {
      async.waterfall([
        function removeExistingInstance(cb) {
          Instance.find({
            'name': 'TEMPLATE_' + model.name,
            'owner': createdBy
          }, function (err, docs) {
            console.log('REMOVING existing instance for (', model.name, ')');
            if (!err && docs) {
              docs.forEach(function (doc) {
                doc.remove();
              });
            }
            cb();
          })
        },
        function newContext(cb) {
          console.log('newContext (', model.name, ')');
          var context = new Context({
            owner: createdBy,
            name: model.name,
            description: 'The most awesome dockerfile, EVER',
            isSource: true
          });
          context.save(cb);
        },
        function newICV(context, count, cb) {
          console.log('newICV (', model.name, ')');
          var icv = new InfraCodeVersion({
            context: context._id
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
      ], cb);
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
      build.build({message: 'seed instance script'}, function (err) {
        cb(err, build);
      });
    }

    function createInstance(build, cb) {
      console.log('createInstance (', model.name, ')');
      var instance = ctx.user.createInstance({
        build: build.id(),
        name: 'TEMPLATE_' + model.name,
        owner: createdBy
      }, function (err, newInstance) {
        if (err) {
          throw err;
        }
        console.log('DONE (', model.name, ')');
        cb();
      });
    }

  });

  async.parallel(parallelFunctions, cb);
}

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
  cv.save(function (err, version) {
    cb(err, version);
  });
}
var sources = [{
  name: 'NodeJs',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/node/tags/manage/\n' +
  'FROM node:<node-version>\n' +
  '\n' +
  '# Open up ports on the server\n' +
  'EXPOSE <user-specified-ports>\n' +
  '\n' +
  '# Add repository files to server\n' +
  'ADD ./<repo-name> /<repo-name>\n' +
  'WORKDIR /<repo-name>\n' +
  '\n' +
  '# Install dependencies\n' +
  'RUN apt-get update \n' +
  '<add-dependencies>\n' +
  '\n' +
  'RUN npm install\n' +
  '\n' +
  '# Command to start the app\n' +
  'CMD <start-command>\n'
}, {
  name: 'Rails',
  body: 'FROM ruby:<ruby-version>\n' +
  '# Open up ports on the server\n' +
  'EXPOSE <user-specified-ports>\n' +
  '\n' +
  '# Install Rails (and its dependencies)\n' +
  'RUN apt-get update && apt-get install -y nodejs --no-install-recommends && rm -rf /var/lib/apt/lists/*\n' +
  '\n' +
  '\n' +
  '# see http://guides.rubyonrails.org/command_line.html#rails-dbconsole\n' +
  'RUN apt-get update && apt-get install -y mysql-client postgresql-client sqlite3 --no-install-recommends && rm -rf /var/lib/apt/lists/*\n' +
  '\n' +
  '# Specify the version of Rails to install\n' +
  'ENV RAILS_VERSION <rails-version>\n' +
  'RUN gem install rails --version "$RAILS_VERSION"\n' +
  '\n' +
  '# Add repository files to server\n' +
  'ADD ./<repo-name> /<repo-name>\n' +
  'WORKDIR /<repo-name>\n' +
  '\n' +
  '# Install dependencies\n' +
  'RUN apt-get update \n' +
  '<add-dependencies>\n' +
  '\n' +
  'RUN bundle install\n' +
  '\n' +
  '# Setup and seed database\n' +
  'RUN rake db:create db:migrate\n' +
  '\n' +
  '# Command to start the app\n' +
  'CMD <start-command>\n'
}, {
  name: 'Ruby',
  body: 'FROM ruby:<ruby-version>\n' +
  '# Open up ports on the server\n' +
  'EXPOSE <user-specified-ports>\n' +
  '\n' +
  '# Install Rails (and its dependencies)\n' +
  'RUN apt-get update && apt-get install -y nodejs --no-install-recommends && rm -rf /var/lib/apt/lists/*\n' +
  '\n' +
  '\n' +
  '# see http://guides.rubyonrails.org/command_line.html#rails-dbconsole\n' +
  'RUN apt-get update && apt-get install -y mysql-client postgresql-client sqlite3 --no-install-recommends && rm -rf /var/lib/apt/lists/*\n' +
  '\n' +
  '# Add repository files to server\n' +
  'ADD ./<repo-name> /<repo-name>\n' +
  'WORKDIR /<repo-name>\n' +
  '\n' +
  '# Install dependencies\n' +
  'RUN apt-get update \n' +
  '<add-dependencies>\n' +
  '\n' +
  'RUN bundle install\n' +
  '\n' +
  '# Setup and seed database\n' +
  'RUN rake db:create db:migrate\n' +
  '\n' +
  '# Command to start the app\n' +
  'CMD <start-command>\n'
}, {
  name: 'Python',
  body: 'FROM python:<python-version>\n' +
  '\n' +
  '# Open up ports on the server\n' +
  'EXPOSE <user-specified-ports>\n' +
  '\n' +
  '# Install environmental dependencies\n' +
  'RUN apt-get -y -q update && apt-get install -y -q libmysqlclient-dev postgresql-server-dev-9.1\n' +
  '\n' +
  '# Add the repository to the /home folder\n' +
  'ADD ./<repo-name> /home/\n' +
  'WORKDIR /home\n' +
  '\n' +
  '# Install dependencies\n' +
  'RUN pip install -r /home/requirements.txt\n' +
  '\n' +
  'RUN apt-get update \n' +
  '<add-dependencies>\n' +
  '\n' +
  '# Command to start the app\n' +
  'CMD <start-command>\n'
}];