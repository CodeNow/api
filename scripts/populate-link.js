/**
 * Triggers events which in turn enqueues link rabbitmq tasks which will seed/update navi's
 * database for routing.
 *
 * Server is initialized first because:
 * various things are initialized when we start the server that must be initialized before we
 * can emit websocket events without triggering errors
 * LOG_LEVEL_STDOUT=none NODE_PATH=lib/ node scripts/populate-link.js
 */
'use strict'

require('loadenv')()

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

// Load all the things!
require('express-app')

// dummy port
process.env.PORT = 7777
var Server = require('server')
var server = new Server()

var mongoose = require('mongoose')
var async = require('async')

var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

if (!process.env.MONGO) {
  throw new Error('process.env.MONGO does not exist!')
}

server.start(function () {
  console.log('server started', arguments)
  console.log('Connecting to ', process.env.MONGO, ' in 10 seconds')
  console.log('Connecting...')
  mongoose.connect(process.env.MONGO, function () {
    console.log('Connected.')

    console.log('Fetching Instances')
    Instance.find({}, function (err, instances) {
      if (err) {
        throw err
      }
      console.log(instances.length + ' instances fetched')
      async.eachSeries(instances, function (instance, cb) {
        User.find({
          'accounts.github.id': instance.createdBy.github
        }, function (err, users) {
          if (err) { throw err }
          if (!users.length) { throw new Error('User not found') }
          if (dryRun) {
            console.log('DRY RUN - Would update instance - ', instance._id)
            return cb()
          }
          var user = users[0]
          instance.emitInstanceUpdate(user, 'update', function (err) {
            if (err) {
              throw err
            }
            if (!instance.owner.username || !instance.createdBy.username) {
              console.log('Instance did not populate owner username and createdBy username', instance._id)
            }
            console.log('updated: ', instance._id)
            cb()
          })
        })
      }, function () {
        console.log('DONE!')
        process.exit(1)
      })
    })
  })
})

