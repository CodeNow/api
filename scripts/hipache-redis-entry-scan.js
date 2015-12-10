/**
 * Compare instance documents in API mongodb database to userland-hipache redis entries to find any
 * potentially missing hipache redis entries.
 */
'use strict';

require('loadenv')()

// dummy port
process.env.PORT = 7777
var Server = require('server')
var server = new Server()

var async = require('async')
var mongoose = require('mongoose')
var redis = require('redis');

if (!hasKeypaths(process.env, ['MONGO', 'REDIS_PORT', 'REDIS_IPADDRESS'])) {
  throw new Error('missing required ENV!')
}

var redisClient = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_IPADDRESS
)

var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

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

          var user = users[0]

          var instancePorts = Object.keys(instance.ports).map(function (portString) {
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
              //hostname: ex, 2zrr96-pd-php-test-staging-paulrduffy.runnableapp.com
              [instance.shortHash,
                instance.name,
                'staging',
                user.accounts.github.username,
                '.runnableapp.com'].join('-')
            ].join('')
            var elasticUrlKey = [
              'frontend:',
              port,
              '.',
              //hostname: ex, pd-php-test-staging-paulrduffy.runnableapp.com
              [instance.name,
                'staging',
                user.accounts.github.username,
                '.runnableapp.com'].join('-')
            ].join('')
            redisKeys.push(directUrlKey)
            redisKeys.push(elasticUrlKey)
          })

          async.eachSeries(redisKeys, function (key, cb) {
            console.log('checking: ' + key)
            redis.lrange(key, 0, 1, function (err, response) {
              if (err) { throw err }
              console.log('response', response)
              if (!response) {
                console.log('userland-hipache redis entry not found: '+key)
                process.exit(1)
              }
              cb();
            })
          }, cb);

        })
      })
    })
  })
})
