'use strict'

require('loadenv')()
var Instances = require('models/mongo/instance')
var keypather = require('keypather')()
var async = require('async')
var mongoose = require('mongoose')
var Github = require('models/apis/github')
mongoose.connect(process.env.MONGO)

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

async.waterfall([
  function getAllMasterPodInstances (cb) {
    Instances.find({}, cb)
  },
  function renameMasterPods (instances, cb) {
    console.log('updating instances:', instances.length)
    async.eachLimit(
      instances,
      50,
      function (i, eachCb) {
        var id = i._id.toString()
        if (dryRun) {
          eachCb()
        } else {
          if (keypather.get(i, 'owner.username')) {
            var hostname = i.getElasticHostname(i.owner.username)
            Instances.findByIdAndUpdate(
              id,
              {
                $set: {
                  hostname: hostname,
                  elasticHostname: hostname
                }
              }, eachCb)
          } else if (keypather.get(i, 'owner.github')) {
            var github = new Github()
            github.getUserById(i.owner.github, function (err, user) {
              if (err || !user) {
                console.log('Github query failed for ', i.owner.github)
                return eachCb()
              } else {
                var hostname = i.getElasticHostname(user.login)
                Instances.findByIdAndUpdate(
                  id,
                  {
                    $set: {
                      'owner.username': user.login,
                      hostname: hostname,
                      elasticHostname: hostname
                    }
                  }, eachCb)
              }
            })
          } else {
            eachCb()
          }
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
