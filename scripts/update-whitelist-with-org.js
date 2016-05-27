'use strict'
/**
 * This script updates all instances to save their hostname (and elasticHostname) to the database.
 * It also saves the name of the owner from github (if it wasn't already there)
 */
require('loadenv')()
var Whitelist = require('models/mongo/user-whitelist')
var keypather = require('keypather')()
var mongoose = require('mongoose')
var Github = require('models/apis/github')
mongoose.connect(process.env.MONGO)
var Promise = require('bluebird')

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)

Whitelist.findAsync({})
  .each(function (entry) {
    return Promise.try(function () {
      Promise.promisifyAll(Github)
      Promise.promisifyAll(Github.prototype)
      var github = new Github()
      return github.getUserByUsernameAsync(entry.name)
        .get('id')
        .catch(function () {
          return
        })
    })
      .then(function (githubId) {
        if (dryRun || !githubId) {
          console.log('Skipped whitelist ' + entry.name)
          return
        } else {
          var id = entry._id.toString()
          return Whitelist.findByIdAndUpdateAsync(id, {
            $set: {
              'githubId': githubId,
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
