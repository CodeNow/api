'use strict'

require('loadenv')()
var redis = require('models/redis')
var async = require('async')

main()

function main () {
  if (!process.env.REDIS_IPADDRESS || !process.env.REDIS_PORT) {
    console.error('NEED REDIS INFORMATION')
    return process.exit(-1)
  }

  if (!process.env.CURRENT_DOMAIN || !process.env.TARGET_DOMAIN) {
    console.error('NEED DOMAIN INFORMATION')
    return process.exit(-2)
  }

  var dryRun = !process.env.MIGRATE_YES
  if (dryRun) {
    console.log('DRY RUNNING')
  } else {
    console.log('ACTUALLY MOVING THINGS IN REDIS')
  }

  async.waterfall([
    function (cb) {
      // frontend:80.fon.bkendall.runnable3.net
      redis.keys('frontend:*.*.*.' + process.env.CURRENT_DOMAIN, cb)
    },
    function (keys, cb) {
      async.forEach(
        keys,
        function (key, cb) {
          async.waterfall([
            redis.lrange.bind(redis, key, 0, -1),
            function (data, cb) {
              // this looks convoluted, but should always work :)
              var newKey = key.replace(process.env.CURRENT_DOMAIN, process.env.TARGET_DOMAIN)
              newKey = newKey.split(':')
              var subParts = newKey[1].split('.')
              var port = subParts.shift()
              var lowerName = subParts.shift()
              var owner = subParts.shift()
              subParts.unshift(lowerName + '-' + owner)
              subParts.unshift(port)
              newKey[1] = subParts.join('.')
              newKey = newKey.join(':')

              if (dryRun) {
                console.log('DRYRUN: would move to new key', newKey)
                cb(null, newKey)
              } else {
                // it likes all the args in one array
                data.unshift(newKey)
                // delete the key to make sure what we are adding is the new version
                redis.del(newKey, function (err) {
                  if (err) { return cb(err) }
                  redis.rpush(data, function (err) {
                    // stripping out returned data
                    cb(err, newKey)
                  })
                })
              }
            },
            function (newKey, cb) {
              console.log('moved', key, 'to', newKey)
              cb()
            }
          ], function (err) {
            // don't error if the waterfall (copy key) couldn't happen
            // just print an error
            if (err) {
              console.error('Could not move key:', key)
            }
            cb()
          })
        },
        cb)
    }
  ], function (err) {
    if (err) {
      console.error(err)
      process.exit(1)
    } else {
      process.exit(0)
    }
  })
}
