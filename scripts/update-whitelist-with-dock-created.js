//  'use strict'
//  /**
//   * This script updates all instances to save their hostname (and elasticHostname) to the database.
//   * It also saves the name of the owner from github (if it wasn't already there)
//   */
//  require('loadenv')()
//  var UserWhitelist = require('models/mongo/user-whitelist')
//  var mongoose = require('mongoose')
//  mongoose.connect(process.env.MONGO)
//
//  var Promise = require('bluebird')
//
//  var dryRun = !process.env.ACTUALLY_RUN
//
//  console.log('dryRun?', !!dryRun)
//
//  Promise
//    .try(function () {
//      if (!dryRun) {
//        return UserWhitelist.updateAsync({
//          firstDockCreated: { $ne: true }
//        }, {
//          $set: {
//            firstDockCreated: trueå
//          }
//        }, { multi: true })
//      }
//      return UserWhitelist.findAsync({
//        firstDockCreated: { $ne: true }
//      })
//        .get('length')
//    })
//    .then(function (count) {
//      console.log('updated', count, 'whitelists')
//    })
//    .then(function () {
//      console.log('done.')
//      process.exit(0)
//    })
//    .catch(function (err) {
//      console.error('error happened', err)
//      return process.exit(1)
//    })
