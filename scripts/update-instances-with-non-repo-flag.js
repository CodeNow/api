'use strict'
/**
 * This script updates all instances to save their hostname (and elasticHostname) to the database.
 * It also saves the name of the owner from github (if it wasn't already there)
 */
require('loadenv')()
var Instances = require('models/mongo/instance')
var ContextVersions = require('models/mongo/context-version')
var keypather = require('keypather')()
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

Instances.findAsync({})
  .each(function (i) {
    if (dryRun || ContextVersions.getMainAppCodeVersion(i.contextVersion.appCodeVersions)) {
      console.log('Skipped instance ' + i.name)
      return
    } else {
      var id = i._id.toString()
      return Instances.findByIdAndUpdateAsync(id, {
        $set: {
          'isNonRepoContainer': true
        }
      })
   }
  })
  .then(function () {
    console.log('done.')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })
