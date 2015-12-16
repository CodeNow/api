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

'use strict'

require('loadenv')()

var fs = require('fs')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var InfraCodeVersion = require('models/mongo/infra-code-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var async = require('async')
var Runnable = require('runnable')
var user = new Runnable(process.env.FULL_API_DOMAIN)
var mongoose = require('mongoose')
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
  name: 'Go',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/golang').toString()
}, {
  name: 'MySQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mysql').toString()
}, {
  name: 'Consul-Server',
  body: 'FROM gliderlabs/consul-server:0.5\n' +
    'EXPOSE 8400 8500 8600 53'
}, {
  name: 'Cassandra',
  body: '# View more information about this dockerfile here: ' +
    'https://registry.hub.docker.com/u/spotify/cassandra/\n' +
    'FROM spotify/cassandra\n\n' +
    '# Open ports on server\n' +
    'EXPOSE 7199 7000 7001 9160 9042 22 8012 61621'
}, {
  name: 'MongoDB',
  body: '# Full list of versions available here:' +
    ' https://registry.hub.docker.com/_/mongo/tags/manage/\n' +
    'FROM mongo:2.8.0\n'
}, {
  name: 'Redis',
  body: '# Full list of versions available here:' +
    ' https://registry.hub.docker.com/_/redis/tags/manage/\n' +
    'FROM redis:2.8.9\n'
}, {
  name: 'ElasticSearch',
  body: '# Full details of this base image can be found here:' +
    ' https://registry.hub.docker.com/u/dockerfile/elasticsearch/\n' +
    'FROM elasticsearch\n'
}, {
  name: 'Memcached',
  body: fs.readFileSync('./scripts/sourceDockerfiles/memcached').toString()
}, {
  name: 'Nginx',
  body: '# Full list of versions available here:' +
    ' https://registry.hub.docker.com/_/nginx/tags/manage/\n' +
    'FROM nginx:1.7.9\n'
}, {
  name: 'RabbitMQ',
  body: '# Full list of versions available here:' +
    ' https://registry.hub.docker.com/_/rabbitmq/tags/manage/\n' +
    'FROM rabbitmq:3.4.2\n'
}, {
  name: 'RethinkDB',
  body: fs.readFileSync('./scripts/sourceDockerfiles/rethinkdb').toString()
}]
var createdBy = { github: process.env.HELLO_RUNNABLE_GITHUB_ID }

var ctx = {}

/*
 * START SCRIPT
 */
main()

function main () {
  connectAndLoginAsHelloRunnable(function (err) {
    if (err) {
      console.error('hello runnable error', err)
      return process.exit(err ? 1 : 0)
    }
    createAllSources()
  })
}

/*
 * CONNECT AND LOGIN
 */
function connectAndLoginAsHelloRunnable (cb) {
  mongoose.connect(process.env.MONGO)
  async.series([
    ensureMongooseIsConnected,
    makeHelloRunnableAdmin,
    loginAsHelloRunnable
  ], cb)
}
function ensureMongooseIsConnected (cb) {
  console.log('ensureMongooseIsConnected')
  if (mongoose.connection.readyState === 1) {
    cb()
  } else {
    mongoose.connection.once('connected', cb)
  }
}
function makeHelloRunnableAdmin (cb) {
  console.log('makeHelloRunnableAdmin')
  var $set = { permissionLevel: 5 }
  User.updateByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, { $set: $set }, cb)
}
function loginAsHelloRunnable (cb) {
  console.log('loginAsHelloRunnable')
  User.findByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, userData) {
    if (err) { return cb(err) }
    ctx.user = user.githubLogin(userData.accounts.github.accessToken, cb)
  })
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
      console.error('create sources error', err)
    } else {
      console.log('done')
      process.exit(0)
    }
  })
}
function createBlankSource (done) {
  console.log('createBlankSourceContext')
  var blankData = {
    name: 'Blank',
    isSource: true,
    body: '# Empty Dockerfile!\n'
  }
  async.waterfall([
    doneIfExistingContextFound(blankData, done),
    createContext(blankData),
    createICV,
    function (blankData, context, icv, cb) {
      ctx.blankIcvId = icv._id
      cb(null, blankData, context, icv)
    },
    createCV
  ], done)
}
function createOtherSources (cb) {
  async.forEach(sources, createSource, cb)
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
  ], done)
}
function doneIfExistingInstanceFound (data, done) {
  return function (cb) {
    Instance.find({
      'lowerName': (((data.isTemplate) ? 'TEMPLATE_' : '') + data.name).toLowerCase(),
      'owner': createdBy
    }, function (err, docs) {
      if (err) { return cb(err) }
      if (docs && docs.length) {
        console.log('Existing "' + data.name + '" instance found')
        return done() // if exists.. done. don't continue
      }
      cb()
    })
  }
}
function doneIfExistingContextFound (data, done) {
  return function (cb) {
    console.log('findOrCreateContext')
    Context.findOne({ 'name': data.name, 'isSource': data.isSource }, function (err, context) {
      if (err) { return cb(err) }
      if (!context) {
        return cb()
      } else {
        console.log('Existing "' + data.name + '" context found')
        // Source already exists. Just call done.
        if (data.name.toLowerCase() === 'blank') {
          InfraCodeVersion.findOne({ context: context.id }, function (err, icv) {
            if (err || !icv) {
              // throw!!! bc rest of script cannot run w/out this.
              throw new Error('Blank Icv not found! err:' + err)
            }
            console.log('Blank icv found (to be parent of others): ' + icv._id)
            ctx.blankIcvId = icv._id
            done()
          })
        } else {
          done()
        }
      }
    })
  }
}
function createContext (data) {
  return function (cb) {
    console.log('Create Context "' + data.name + '"')
    var context = new Context({
      owner: createdBy,
      name: data.name,
      description: data.name,
      isSource: data.isSource
    })
    context.save(function (err, context) {
      cb(err, data, context)
    })
  }
}
function createICV (data, context, cb) {
  console.log('createICV "' + data.name + '"')
  var icv = new InfraCodeVersion({
    context: context._id,
    parent: ctx.blankIcvId
  })
  async.series([
    icv.initWithDefaults.bind(icv),
    icv.save.bind(icv),
    icv.createFs.bind(icv, { name: 'Dockerfile', path: '/', body: data.body })
  ], function (err) {
    cb(err, data, context, icv)
  })
}
function createCV (data, context, icv, cb) {
  console.log('createCV')
  var cv = new ContextVersion({
    createdBy: createdBy,
    context: context._id,
    advanced: true,
    created: new Date(),
    owner: createdBy,
    infraCodeVersion: icv._id
  })
  cv.save(function (err, version) {
    cb(err, data, version)
  })
}
function createBuild (data, version, cb) {
  console.log('createBuild (', data.name, ')')
  var build = ctx.user.createBuild({
    contextVersions: [version._id],
    createdBy: createdBy,
    owner: createdBy // same on purpose
  }, function (err) {
    cb(err, data, build, version)
  })
}
function buildBuild (data, build, version, cb) {
  console.log('buildBuild (', data.name, ')')
  build.build({message: 'seed instance script', noCache: true}, function (err) {
    setTimeout(function () {
      cb(err, data, build)
    }, 1000)
  })
}
function createInstance (data, build, cb) {
  console.log('createInstance (', data.name, ')')
  ctx.user.createInstance({
    build: build.id(),
    name: ((data.isTemplate) ? 'TEMPLATE-' : '') + data.name,
    masterPod: true,
    owner: createdBy
  }, function (err) {
    console.log('Created Instance (done) (', data.name, ')', err)
    cb(err)
  })
}
