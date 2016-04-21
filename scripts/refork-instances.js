'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var Users = require('models/mongo/user')
var async = require('async')
var mongoose = require('mongoose')
var Runnable = require('@runnable/api-client')
var keypather = require('keypather')()

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
  function getAllFokedInstances (cb) {
    console.log('fetching forked instances')
    Instances.find({ autoForked: true }, function (err, instances) {
      if (err) { return cb(err) }
      cb(null, instances)
    })
  },
  function deleteAndFork (instances, cb) {
    console.log('looking at instances', instances.length)
    async.eachLimit(instances, 10, function (instance, eachCb) {
      var githubId = instance.createdBy.github
      var token = tokenHash[githubId]
      if (token) {
        deleteAndForkInstance(token, instance, eachCb)
      } else {
        Users.findOne({ 'accounts.github.id': githubId }, function (err, user) {
          if (err) {
            console.log('error finding user', githubId)
            return eachCb()
          }
          token = user.accounts.github.accessToken
          tokenHash[githubId] = token
          deleteAndForkInstance(token, instance, eachCb)
        })
      }
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

function deleteAndForkInstance (token, instance, cb) {
  console.log('deleting and forking', instance.name, instance.build)
  console.log('logging in to runnable')
  var user = new Runnable(process.env.API_HOST)
  user.githubLogin(token, function (err) {
    if (err) {
      console.error('error logging in', token, err)
      return cb()
    }
    if (dryRun) {
      return cb()
    }
    var branchName = instance.contextVersion.appCodeVersions[0].lowerBranch
    user.newInstance(instance.shortHash).destroy(function (err) {
      if (err) {
        console.log('instance wasnot deleted', instance.name, err)
        return cb()
      }
      console.log('instance was deleted', instance.name, instance.build)
      forkMasterInstance(user, instance, instance.build, branchName, function (err) {
        if (err) {
          console.error('err reforking', instance.name, err.message)
        } else {
          console.log('instance was reforked', instance.name)
        }
        cb()
      })
    })
  })
}

function forkMasterInstance (user, masterInst, buildId, branch, cb) {
  console.log('forking masterInst', branch, masterInst.build, buildId)
  // basically only letters, numbers and - are allowed in domain names
  var sanitizedBranch = branch.replace(/[^a-zA-Z0-9]/g, '-')
  var body = {
    parent: masterInst.shortHash,
    build: buildId,
    name: sanitizedBranch + '-' + masterInst.name,
    env: masterInst.env,
    owner: {
      github: masterInst.owner.github
    },
    masterPod: false,
    autoForked: true
  }
  user.createInstance(body, function (err, instance) {
    if (err) {
      var errMsg = keypather.get(err, 'output.payload.message')
      if (err.output.statusCode === 409 && errMsg === 'instance with lowerName already exists') {
        // retry and append suffix to the parent instance name
        masterInst.name = masterInst.name + '-1'
        forkMasterInstance(user, masterInst, buildId, sanitizedBranch, cb)
      } else {
        cb(err)
      }
    } else {
      cb(null, instance)
    }
  })
}
