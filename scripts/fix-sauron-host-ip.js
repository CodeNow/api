'use strict'
require('loadenv')()
var Instance = require('models/mongo/instance.js')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
var async = require('async')
var redis = require('models/redis')

async.waterfall([
  getAllInstance,
  eachInstance
], function (err) {
  if (err) {
    return console.log('ERROR', err.stack)
  }
  console.log('done everything went well')
  mongoose.disconnect()
})

function getAllInstance (cb) {
  console.log('getAllInstance')
  Instance.find({
    'network.hostIp': {
      $exists: true
    }
  }, cb)
}

function eachInstance (instances, cb) {
  console.log('eachInstance')
  if (!instances || instances.length === 0) {
    return cb()
  }
  var key = 'weave:network:container'
  redis.hgetall(key, function (err, containersMapped) {
    if (err) { return cb(err) }
    async.eachLimit(instances, 1000, function (instance, cb) {
      console.log('eachInstance:instance', instance._id)
      var mongoContainer = instance.container && instance.container.dockerContainer
      var redisContainer = containersMapped[instance.network.hostIp]
      if (!mongoContainer && redisContainer) {
        console.log('Missing in Mongo: DELETE OUT OF REDIS')
        console.log(redisContainer)
        console.log(mongoContainer)
        console.log('instance.owner.github', instance.owner.github)
        console.log('instance.name', instance.name)
        return redis.hdel(key, instance.network.hostIp, cb)
      } else if (redisContainer &&
        redisContainer !== mongoContainer) {
        console.log('Mongo/Redis both exist but out of sync: UPDATE REDIS')
        console.log(redisContainer)
        console.log(mongoContainer)
        console.log('instance.owner.github', instance.owner.github)
        console.log('instance.name', instance.name)
        return redis.hset(key, instance.network.hostIp, instance.container.dockerContainer, cb)
      }
      cb()
    }, cb)
  })
}
