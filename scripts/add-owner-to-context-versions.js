'use strict'
require('loadenv')()

var ContextVersion = require('models/mongo/context-version')
var Context = require('models/mongo/context')

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

var async = require('async')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)

async.waterfall([
  function getAllCv (cb) {
    ContextVersion.find({ 'owner.github': { $exists: false } }, cb)
  },
  function updateCv (cvs, cb) {
    if (typeof cvs !== 'object') {
      return cb(new Error('cv not array'))
    }
    if (cvs.length <= 0) {
      return cb(new Error('nothing found for cvs'))
    }
    console.log('handling', cvs.length, 'cvs')
    var count = 0
    async.eachLimit(cvs, 1, function (cv, eachCb) {
      Context.findById(cv.context, function (err, context) {
        count++
        if (err) {
          console.log('Context find err', err, count + '/' + cvs.length)
          return eachCb(err)
        }
        if (!context) {
          console.log('nothing found for context', count + '/' + cvs.length)
          return eachCb(new Error('no context found'))
        }
        console.log('updating cv', cv._id, 'with owner', context.owner, count + '/' + cvs.length)
        if (dryRun) {
          return eachCb()
        }
        ContextVersion.update({_id: cv._id}, {
          $set: { 'owner': context.owner }
        }, eachCb)
      })
    }, cb)
  }], function (err) {
  if (err) { console.log('some err', err) }
  console.log('done... disconnect from mongo')
  mongoose.disconnect(function (err) {
    console.log('DONE!', err)
    process.exit(0)
  })
})
