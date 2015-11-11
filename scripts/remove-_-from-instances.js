'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var Users = require('models/mongo/user')
var async = require('async')
var mongoose = require('mongoose')
var Runnable = require('runnable')

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

var tokenHash = {}

async.waterfall([
  function connectMongo (cb) {
    console.log('connect to mongo')
    mongoose.connect(process.env.MONGO, cb)
  },
  function getAllInstances (cb) {
    console.log('fetching instances')
    Instances.find({}, function (err, instances) {
      if (err) { return cb(err) }
      var renameList = instances.filter(function (i) {
        return ~i.name.indexOf('_')
      })
      cb(null, renameList)
    })
  },
  function rename (renameList, cb) {
    console.log('looking at instances', renameList.length)
    async.eachLimit(renameList, 10, function (instance, eachCb) {
      var githubId = instance.createdBy.github
      var token = tokenHash[githubId]
      if (token) {
        renameInstance(token, instance, eachCb)
      } else {
        Users.findOne({ 'accounts.github.id': githubId }, function (err, user) {
          if (err) { return cb(err) }
          token = user.accounts.github.accessToken
          tokenHash[githubId] = token
          renameInstance(token, instance, eachCb)
        })
      }
    }, cb)
  }
], function (err) {
  console.log('done. err', err)
  process.exit(0)
})

function renameInstance (token, instance, cb) {
  var newName = instance.name.replace(/[^a-zA-Z0-9]/g, '-')
  console.log('RENAMING', instance.name, newName)
  console.log('logging in to runnable')
  var user = new Runnable(process.env.API_HOST)
  user.githubLogin(token, function (err) {
    if (err) {
      console.error('error logging in', token)
      return cb()
    }
    if (dryRun) {
      return cb()
    }
    user.updateInstance(instance.shortHash.toString(), {
      name: newName
    }, function (err) {
      if (err) { console.error('err renaming', instance.name, newName, err.message) }
      cb()
    })
  })
}
