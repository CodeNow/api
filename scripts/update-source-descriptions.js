/*
 * This script is used to add the descriptions to the existing Hello Runnable instances,
 * used in the configure page
 * `NODE_ENV=development NODE_PATH=./lib node scripts/update-source-descriptions.js`
 *
 * NOTE: Must log in as HelloRunnable and populate user model in mongo before running this script
 */

'use strict'

require('loadenv')()

var Context = require('models/mongo/context')
var User = require('models/mongo/user')
var async = require('async')
var Runnable = require('runnable')
var user = new Runnable(process.env.FULL_API_DOMAIN)
var mongoose = require('mongoose')
var sources = [{
  name: 'PostgreSQL',
  description: 'An object-relational database management system'
}, {
  name: 'MySQL',
  description: 'Relational database management system'
}, {
  name: 'MongoDB',
  description: 'A cross-platform document-oriented database'
}, {
  name: 'Redis',
  description: 'A data structure server'
}, {
  name: 'ElasticSearch',
  description: 'Search and analyze data in real time'
}, {
  name: 'Nginx',
  description: 'High-performance load balancer and application accelerator'
}, {
  name: 'RabbitMQ',
  description: 'Robust messaging for applications'
}, {
  name: 'Cassandra',
  description: 'Open source distributed database management system'
}, {
  name: 'HBase',
  description: 'Hadoop database, a distributed, scalable, big data store'
}, {
  name: 'Memcached',
  description: 'A general-purpose distributed memory caching system'
}]

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
    createOtherSources(function () {
      process.exit(0)
    })
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
  var $set = {permissionLevel: 5}
  User.updateByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, {$set: $set}, cb)
}
function loginAsHelloRunnable (cb) {
  console.log('loginAsHelloRunnable')
  User.findByGithubId(process.env.HELLO_RUNNABLE_GITHUB_ID, function (err, userData) {
    if (err) {
      return cb(err)
    }
    ctx.user = user.githubLogin(userData.accounts.github.accessToken, cb)
  })
}

function createOtherSources (cb) {
  async.forEach(sources, updateDescriptions, function () {
    cb()
  })
}

function updateDescriptions (data, done) {
  if (data.description) {
    console.log('updating description for ', data.name)
    var query = {
      'lowerName': data.name.toLowerCase(),
      'owner.github': process.env.HELLO_RUNNABLE_GITHUB_ID
    }
    if (!process.env.ACTUALLY_RUN) {
      console.log('Nope, just a dry run')
      Context.findOne(query, function (err, context) {
        if (err) {
          console.error('Finding context err for ' + data.name, err)
          return done(err)
        } else {
          console.log('description would have been changed for ', context)
          done()
        }
      })
    } else {
      Context.findOneAndUpdate(query, {
        $set: {
          description: data.description
        }
      }, function () {
        done()
      })
    }
  } else {
    done()
  }
}
