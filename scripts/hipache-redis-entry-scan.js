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
var request = require('request')

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

var instancesMissingHipache = []
var instancesWithHipache = []

var userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like' +
  ' Gecko) Chrome/47.0.2526.80 Safari/537.36'

server.start(function () {
  console.log('server started')
  mongoose.connect(process.env.MONGO, function () {
    console.log('mongo connected')

    request.get({
      method: 'GET',
      url: 'https://api.github.com/users/' + process.env.ORG,
      headers: {
        'User-Agent': userAgent
      }
    }, function (err, res, body) {
      if (err) {
        throw err
      }
      body = JSON.parse(body)
      console.log('owner.github', body.id)

      Instance.find({
        container: {
          $exists: true
        },
        owner: {
          github: body.id
        }
      }, function (err, instances) {
        if (err) {
          throw err
        }
        console.log('found ' + instances.length + ' instances with containers')
        async.eachSeries(instances, function (instance, cb) {
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
        }, function () {
          console.log('----------------------------------------------')
          console.log('NOT_MISSING', instancesWithHipache.length, instancesWithHipache)
          console.log('MISSING', instancesMissingHipache.length, instancesMissingHipache)
          process.exit(0)
        })
      })

    })
  })
})
