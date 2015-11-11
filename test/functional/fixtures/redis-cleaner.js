'use strict'
var createCount = require('callback-count')
var redis = require('models/redis')

exports.clean = function (pattern) {
  return function (cb) {
    redis.keys(pattern, function (err, keys) {
      if (err) {
        return cb(err)
      }
      if (keys.length === 0) {
        return cb()
      }

      var count = createCount(cb)
      keys.forEach(function (key) {
        redis.del(key, count.inc().next)
      })
    })
  }
}
