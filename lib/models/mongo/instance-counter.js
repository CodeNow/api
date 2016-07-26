/**
 * @module lib/models/mongo/instance-counter
 */
'use strict'

var Hashids = require('hashids')
var mongoose = require('mongoose')
var Promise = require('bluebird')

var InstanceCounterSchema = require('models/mongo/schemas/instance-counter')
var InstanceCounter
/**
 * Fetches, increments and calls back with number
 * of global instances (all instances)
 * @param {Function} cb
 */
InstanceCounterSchema.statics.next = function (cb) {
  InstanceCounter.findOneAndUpdate({
    isGlobal: true
  }, {
    $inc: { count: 1 }
  }, {
    upsert: true,
    new: true
  }, function (err, instanceCounter) {
    if (err) { return cb(err) }
    cb(null, instanceCounter.count)
  })
}

/**
 * Fetch number of instances and created unique hash for new instance
 * @param {Function} cb
 */
InstanceCounterSchema.statics.nextHash = function (cb) {
  var self = this
  this.next(function (err, count) {
    if (err) { cb(err) } else { self.hash(count, cb) }
  })
}

/**
 * Generate a seeded hash from a number
 * @param {Number} number
 * @param {Function} cb
 */
InstanceCounterSchema.statics.hash = function (number, cb) {
  var hashids = new Hashids(
    process.env.HASHIDS_SALT,
    process.env.HASHIDS_LENGTH,
    'abcdefghijklmnopqrstuvwxyz0123456789')
  var hash = hashids.encrypt(number)
  cb(null, hash)
}

InstanceCounterSchema.statics.getCountByHash = function (hash, cb) {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
  var number = hashids.decrypt(hash)[0]
  cb(null, number)
}

InstanceCounterSchema.statics.nextForOwner = function (owner, cb) {
  InstanceCounter.findOneAndUpdate({
    isGlobal: false,
    'owner.github': owner.github
  }, {
    $inc: { count: 1 }
  }, {
    upsert: true,
    new: true
  }, function (err, instanceCounter) {
    if (err) { return cb(err) }
    cb(null, instanceCounter.count)
  })
}

InstanceCounterSchema.index({
  isGlobal: 1,
  count: 1,
  'owner.github': 1
})

InstanceCounter = module.exports = mongoose.model('InstanceCounter', InstanceCounterSchema)

Promise.promisifyAll(InstanceCounter)
Promise.promisifyAll(InstanceCounter.prototype)
