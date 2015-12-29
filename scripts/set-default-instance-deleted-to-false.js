'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var async = require('async')
var mongoose = require('mongoose')

var dryRun = !process.env.ACTUALLY_RUN
if (!process.env.API_HOST) {
  console.log('need API_HOST')
  process.exit(1)
}
if (!process.env.MONGO) {
  console.log('need MONGO')
  process.exit(1)
}

console.log('dryRun?', !!dryRun)

async.waterfall([
  function connectMongo (cb) {
    console.log('connect to mongo')
    mongoose.connect(process.env.MONGO, cb)
  },
  function getOldInstances (cb) {
    console.log('fetching old undeleted instances')
    Instances.find({ deleted: { $exists: false } }, function (err, instances) {
      if (err) { return cb(err) }
      cb(null, instances)
    })
  },
  function setDeletedToFalse (instances, cb) {
    console.log('looking at instances', instances.length)
    async.eachLimit(instances, 10, function (instance, eachCb) {
      instance.update({ $set: { deleted: false } }, function (err, instance) {
        if (err) {
          console.log('error updating instance', insatnce)
          return eachCb()
        }
        eachCb()
      })
    }, cb)
  }
], function (err) {
  if (err) {
    console.log('done. err', err)
  }
  console.log('done... disconnect from mongo')
  mongoose.disconnect(function (err) {
    if (err) { throw err }
    console.log('DONE!')
    process.exit(0)
  })
})
