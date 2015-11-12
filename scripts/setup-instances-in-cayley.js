'use strict'
var async = require('async')

if (!process.env.MONGO) {
  throw new Error('MONGO ENV missing')
}
if (!process.env.MONGO_REPLSET_NAME && process.env.NODE_ENV === 'production') {
  throw new Error('MONGO_REPLSET_NAME ENV missing')
}
if (!process.env.RUNNABLE_TOKEN) {
  throw new Error('RUNNABLE_TOKEN ENV missing')
}
if (!process.env.NODE_PATH) {
  throw new Error('NODE_PATH ENV missing')
}
if (!process.env.API_HOST) {
  throw new Error('API_HOST ENV missing')
}

// STEPS TO ADD INSTANCE-GRAPH TO CAYLEY
async.parallel([
  mongooseConnect,
  mongoFindAllInstances,
  loginModerator,
  triggerCayleyInsertion
], done)

var mongoose = require('mongoose')
function mongooseConnect (cb) {
  // mongooseOptions
  var mongooseOptions = {}
  if (process.env.MONGO_REPLSET_NAME) {
    mongooseOptions.replset = {
      rs_name: process.env.MONGO_REPLSET_NAME
    }
  }
  mongoose.connect(process.env.MONGO, mongooseOptions, function (err) {
    if (err) {
      console.error(err.stack)
      throw new Error('fatal error: can not connect to mongo')
    }
    cb()
  })
}

var Instance = require('models/mongo/instance')
function mongoFindAllInstances (cb) {
  Instance.find({}, { shortHash: 1, env: 1 }, function (err, instances) {
    if (err) {
      console.error(err.stack)
      throw new Error('fatal error: can not connect to mongo')
    }
    cb(null, instances)
  })
}

var Runnable = require('runnable')
function loginModerator (instances, cb) {
  var user = new Runnable(process.env.API_HOST)
  user.githubLogin(process.env.RUNNABLE_TOKEN, function (err) {
    if (err) {
      console.error(err.output)
      throw new Error('fatal error: could not login to runnable')
    }
    cb(null, user, instances)
  })
}

function triggerCayleyInsertion (user, instances, cb) {
  var instanceModels = instances
    .map(function (instance) {
      if (!instance.shortHash) {
        throw new Error('fatal error: instance without shortHash found')
      }
      return user.newInstance(instance.toJSON())
    })
  async.eachLimit(instanceModels, 5, function (instanceModel, cb) {
    instanceModel.update({ env: instanceModel.attrs.env || [] }, function (err) {
      if (err) {
        console.error(err.output)
        throw new Error('fatal error: could not update instance ' + instanceModel.id())
      }
      cb()
    })
  }, cb)
}

function done (err) {
  if (err) {
    console.error(err.stack)
    throw err
  }
  console.log('DONE!')
}
