'use strict'
/**
 * This script updates all instances to save their hostname (and elasticHostname) to the database.
 * It also saves the name of the owner from github (if it wasn't already there)
 */
require('loadenv')()
var Instances = require('models/mongo/instance')
var keypather = require('keypather')()
var mongoose = require('mongoose')
var Github = require('models/apis/github')
mongoose.connect(process.env.MONGO)
var Promise = require('bluebird')

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

Instances.findAsync({})
  .each(function (i) {
    return Promise.try(function () {
      if (keypather.get(i, 'owner.username')) {
        return i.owner.username
      }
      if (!keypather.get(i, 'owner.github')) {
        return
      }
      Promise.promisifyAll(Github)
      Promise.promisifyAll(Github.prototype)
      var github = new Github()
      return github.getUserByIdAsync(i.owner.github)
        .get('login')
        .catch(function () {
          return
        })
    })
      .then(function (username) {
        if (dryRun || !username) {
          console.log('Skipped instance ' + i.name)
          return
        } else {
          var hostname = i.getElasticHostname(username)
          var id = i._id.toString()
          return Instances.findByIdAndUpdateAsync(id, {
            $set: {
              'owner.username': username,
              hostname: hostname,
              elasticHostname: hostname
            }
          })
        }
      })
  })
  .then(function () {
    console.log('done.')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })
