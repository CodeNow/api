/**
 * Compare instance documents in API mongodb database to userland-hipache redis entries to find any
 * potentially missing hipache redis entries.
 *
 * ORG=codenow USER_CONTENT_TLD=runnable2.net NODE_PATH=lib/ node scripts/hipache-redis-entry-scan.js
 */
'use strict'

require('loadenv')()

var hasKeypaths = require('101/has-keypaths')
var isObject = require('101/is-object')

// dummy port
process.env.PORT = 7777
var Server = require('server')
var server = new Server()

var async = require('async')
var mongoose = require('mongoose')
var redis = require('redis')

if (!hasKeypaths(process.env, ['MONGO',
    'REDIS_PORT', 'REDIS_IPADDRESS', 'USER_CONTENT_TLD', 'ORG'])) {
  throw new Error('missing required ENV!')
}

var redisClient = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_IPADDRESS
)

var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

var instancesMissingHipache = []
var instancesWithHipache = []

server.start(function () {
  console.log('server started')
  mongoose.connect(process.env.MONGO, function () {
    console.log('mongo connected')

    Instance.find({
      container: {
        $exists: true
      }
    }, function (err, instances) {
      if (err) {
        throw err
      }
      console.log('found ' + instances.length + ' instances with containers')
      async.eachSeries(instances, function (instance, cb) {
        User.find({
          'accounts.github.id': instance.createdBy.github
        }, function (err, users) {
          if (err) { throw err }
          if (!users.length) { throw new Error('User not found') }

          // var user = users[0]

          if (!isObject(instance.container.ports)) {
            console.log('instance does not have ports', instance._id, instance.container.ports)
            return cb()
          }
          console.log('instance does have ports, proceeding', instance._id)

          var instancePorts = Object.keys(instance.container.ports).map(function (portString) {
            return portString.replace(/\/tcp$/, '')
          })

          /**
           * Generate array of all elasticUrl and directUrl redis keys (one for each port) on the
           * instance
           */
          var redisKeys = []
          instancePorts.forEach(function (port) {
            var directUrlKey = [
              'frontend:',
              port,
              '.',
              // hostname: ex, 2zrr96-pd-php-test-staging-paulrduffy.runnableapp.com
              [instance.shortHash,
                '-',
                instance.name,
                '-staging-',
                process.env.ORG,
                '.',
                process.env.USER_CONTENT_TLD].join('').toLowerCase()
            ].join('').toLowerCase()
            redisKeys.push(directUrlKey)
            redisKeys.push(directUrlKey.replace(instance.shortHash + '-', '')) // elasticUrl
          })

          async.eachSeries(redisKeys, function (key, cb) {
            console.log('checking: ' + key)
            redisClient.lrange(key, 0, 1, function (err, response) {
              if (err) { throw err }
              console.log('response', response)
              if (!response.length) {
                instancesMissingHipache.push([key, instance._id])
                console.log('userland-hipache redis entry __NOT__ found: ' + key)
              } else {
                instancesWithHipache.push([key, instance._id])
                console.log('userland-hipache redis entry found: ' + key)
              }
              cb()
            })
          }, cb)
        })
      }, function () {
        console.log('----------------------------------------------')
        console.log('NOT_MISSING', instancesWithHipache.length, instancesWithHipache)
        console.log('MISSING', instancesMissingHipache.length, instancesMissingHipache)
        process.exit(0)
      })
    })
  })
})
