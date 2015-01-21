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
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var Instance = require('models/mongo/instance');
var Build = require('models/mongo/build');
var User = require('models/mongo/user');
var async = require('async');
var Runnable = require('runnable');
var user = new Runnable(process.env.FULL_API_DOMAIN);
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
  removeCurrentSourceTemplates,
  createBlankSourceContext,
  createFirstSourceContext,
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
    function (cb) {
      Instance.find({
        'name': 'Blank',
        'owner': createdBy
      }, function (err, docs) {
        console.log('REMOVING existing instance for (BLANK)');
        if (!err && docs) {
          docs.forEach(function (doc) {
            doc.remove();
          });
          console.log('REMOVING INSTANCES', docs);
        }
        cb();
      });
    },
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
    function (context, icv, cb) {
      ctx.blankIcv = icv;
      cb(null, context, icv)
    },
    newCV
  ], cb);
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
            'name': ((model.isTemplate) ? 'TEMPLATE_' : '') + model.name,
            'owner': createdBy
          }, function (err, docs) {
            console.log('REMOVING existing instance for (', model.name, ')');
            if (!err && docs) {
              docs.forEach(function (doc) {
                doc.remove();
              });
              console.log('REMOVING INSTANCES', docs);
            }
            cb();
          });
        },
        function (cb) {
          if (model.isTemplate) {
            return cb();
          }
          Context.find({
            'name': model.name,
            'owner': createdBy
          }, function (err, docs) {
            console.log('REMOVING existing context for (', model.name, ')');
            if (!err && docs) {
              docs.forEach(function (doc) {
                doc.remove();
              });
            }
            cb();
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
            parent: ctx.blankIcv._id
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
      build.build({message: 'seed instance script'}, function (err) {
        cb(err, build);
      });
    }

    function createInstance(build, cb) {
      console.log('createInstance (', model.name, ')');
      var instance = ctx.user.createInstance({
        build: build.id(),
        name: ((model.isTemplate) ? 'TEMPLATE_' : '') + model.name,
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
  name: 'NodeJs',
  isTemplate: true,
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/node/tags/manage/\n' +
  'FROM node:<nodejs-version>\n' +
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
  isTemplate: true,
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
  isTemplate: true,
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
  isTemplate: true,
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
}, {
  name: 'PostgreSQL',
  body: '# Full list of versions available here: https://registry.hub.docker.com/_/postgres/tags/manage/\n'+
  'FROM postgres:9.4\n' +
  '\n' +
  '# Set recommended environment variables\n' +
  'ENV POSTGRES_USER postgres\n' +
  'ENV POSTGRES_PASSWORD postgres\n' +
  '\n' +
  '# Open port 5432 on the server\n' +
  'EXPOSE 5432\n'
}, {
  name: 'MySQL',
  body: 'FROM mysql:5.6\n' +
'# Set required environment variables\n' +
'ENV MYSQL_USER root\n' +
'ENV MYSQL_PASSWORD root\n' +
'ENV MYSQL_ROOT_PASSWORD root\n' +
'ENV MYSQL_DATABASE app\n\n' +
'# Open port 3306 on the server\n' +
'EXPOSE 3306\n' 
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
