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
    Instances.find({ masterPod: true, 'contextVersion.appCodeVersions.0': {$exists: true} }, cb)
  },
  function renameMasterPods (instances, cb) {
    console.log('updating instances:', instances.length)
    async.eachLimit(
      instances,
      50,
      function (i, eachCb) {
        var id = i._id.toString()
        var repo = keypather.get(i, 'contextVersion.appCodeVersions[0].repo')
        if (!repo) {
          console.log('will not change', i.name)
          return eachCb()
        }
        var newName = repo.split('/')[1]
        if (newName === i.name) { return eachCb() }
        console.log('RENAMING', i.name, newName)
        if (dryRun) { eachCb() } else {
          Instances.findByIdAndUpdate(
            id,
            {
              $set: {
                name: newName,
                lowerName: newName.toLowerCase() // we need to manually set this as well.
              }
            }, eachCb)
        }
      }, cb)
  }
], function (err) {
  console.log('done.')
  if (err) {
    console.error('error happened', err)
    return process.exit(1)
  }
  process.exit(0)
})
