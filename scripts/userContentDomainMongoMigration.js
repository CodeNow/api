'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var async = require('async')
var mongoose = require('mongoose')

main()

function main () {
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

  mongoose.connect(process.env.MONGO)
  async.series([
    function (cb) {
      if (mongoose.connection.readyState === 1) {
        console.error('could not connect to mongo')
        process.exit(-1)
      } else {
        mongoose.connection.once('connected', cb)
      }
    },
    function doStuff (cb) {
      Instances.find(
        { env: { $ne: [] } },
        function (err, instances) {
          if (err) {
            console.log(err)
            process.exit(1)
          } else {
            var hostRegex =
            new RegExp('([0-9a-z-_\\.]+)\\.' + process.env.CURRENT_DOMAIN.replace('.', '\\.'))
            async.forEach(
              instances,
              function (instance, cb) {
                var update = false
                var envs = instance.env
                envs = envs.map(function (e) {
                  var match = hostRegex.exec(e)
                  if (match && match[1]) {
                    update = true
                    console.log('matched', match[0])
                    var replaceName = match[1].replace('.', '-')
                    e = e.replace(match[1], replaceName)
                    e = e.replace(process.env.CURRENT_DOMAIN, process.env.TARGET_DOMAIN)
                    return e
                  } else {
                    return e
                  }
                })
                if (dryRun) {
                  console.log('new envs:', envs)
                  cb()
                } else {
                  if (update) {
                    Instances.findOneAndUpdate(
                      {_id: instance._id},
                      {
                        $set: {
                          env: envs
                        }
                      },
                      function (err, numEffected) {
                        if (err || numEffected === 0) {
                          console.error('could not update instance:', instance._id)
                          cb(err)
                        } else {
                          cb()
                        }
                      }
                    )
                  } else {
                    // no envs to update
                    cb()
                  }
                }
              },
              function (err) {
                if (err) {
                  cb(err)
                } else {
                  console.log('updated all instances')
                  cb()
                }
              }
            )
          }
        }
      )
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
