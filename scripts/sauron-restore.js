'use strict'
require('loadenv')()
var redis = require('models/redis')
var Instance = require('models/mongo/instance')
var mongoose = require('models/mongo/mongoose-control')
var createCount = require('callback-count')
var async = require('async')
var parseUrl = require('url').parse

mongoose.start(function () {
  restoreHosts(function (err) {
    if (err) { throw err }

    console.log('done... disconnect from mongo')
    mongoose.stop(function (err) {
      if (err) { throw err }
      console.log('DONE!')
      process.exit(0)
    })
  })

  function restoreHosts (cb) {
    Instance.find({ 'container.dockerContainer': { $exists: true } }, function (err, instances) {
      if (err) { throw err }

      async.eachLimit(instances, 100, function (instance, cb) {
        var hostIp = instance.network.hostIp
        var networkIp = instance.network.networkIp
        var dockerHostname = parseUrl(instance.container.dockerHost).hostname
        var containerId = instance.container.dockerContainer

        // LOGS for DEBUGGING
        // var count = createCount(4, cb)
        // redis.hmget('weave:network', networkIp, function (err, val) {
        //   // NOTE: may not actually match
        //   if (dockerHostname !== val[0]) {
        //     console.log('INSTANCE', instance._id.toString())
        //     console.log('EXPECT weave:network', networkIp, dockerHostname)
        //     console.log('ACTUAL weave:network', networkIp, val[0])
        //   }
        //   count.next()
        // })
        // redis.hmget('weave:network:container', hostIp, function (err, val) {
        //   // NOTE: may not actually match
        //   if (containerId !== val[0]) {
        //     console.log('INSTANCE', instance._id.toString())
        //     console.log('EXPECT weave:network:container', hostIp, containerId)
        //     console.log('ACTUAL weave:network:container', hostIp, val[0])
        //   }
        //   count.next()
        // })
        // redis.hmget('weave:network:'+networkIp, hostIp, function (err, val) {
        //   // NOTE: may not actually match
        //   if(dockerHostname !== val[0]) {
        //     console.log('INSTANCE', instance._id.toString())
        //     console.log('EXPECT weave:network:'+networkIp, hostIp, dockerHostname)
        //     console.log('ACTUAL weave:network:'+networkIp, hostIp, val[0])
        //   }
        //   count.next()
        // })
        // redis.hmget('weave:network:'+networkIp, networkIp, function (err, val) {
        //   if(networkIp !== val[0]) {
        //     console.log('INSTANCE', instance._id.toString())
        //     console.log('EXPECT weave:network:'+networkIp, networkIp, networkIp)
        //     console.log('ACTUAL weave:network:'+networkIp, networkIp, val[0])
        //   }
        //   count.next()
        // })

        // ACTUAL WRITE
        var count = createCount(cb)
        console.log('RESTORE', instance._id.toString())
        redis.hset('weave:network', networkIp, dockerHostname, count.inc().next)
        redis.hset('weave:network:' + networkIp, networkIp, networkIp, count.inc().next)
        redis.hset('weave:network:' + networkIp, hostIp, dockerHostname, count.inc().next)
        redis.hset('weave:network:container', hostIp, containerId, count.inc().next)
      }, cb)
    })
  }
})
