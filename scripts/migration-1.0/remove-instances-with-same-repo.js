'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var keypather = require('keypather')()
var async = require('async')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

async.waterfall([
  function getAllMasterPodInstances (cb) {
    Instances.find({ 'contextVersion.appCodeVersions.0': { $exists: true } }, cb)
  },
  function removeThings (instances, cb) {
    console.log('looking at instances', instances.length)

    var repos = {}
    instances.forEach(function (i) {
      var repo = keypather.get(i, 'contextVersion.appCodeVersions[0].repo')
      if (repos[repo]) { repos[repo].push(i) } else { repos[repo] = [i] }
    })

    async.eachLimit(Object.keys(repos), 10, function (repo, cb) {
      if (repos[repo].length > 1) {
        repos[repo].shift()
        async.each(repos[repo], function (i, cb) {
          console.log('removing', i.lowerName)
          if (dryRun) { cb() } else { Instances.remove({ _id: i._id.toString() }, cb) }
        }, cb)
      } else {
        cb()
      }
    })
  }
], function (err) {
  console.log('done.')
  if (err) {
    console.error('error happened', err)
    return process.exit(1)
  }
  process.exit(0)
})
