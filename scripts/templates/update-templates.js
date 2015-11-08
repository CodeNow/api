/*
 * This script updates the database for a given environment with the template information in
 * scripts/templates/*.json. It updates any documents already in mongo while adding any that don't
 * exist. It does not remove templates that were removed in the scripts/templates folder. Use the
 * 'deleted' flag to 'remove' them from the database
 */

'use strict'

require('loadenv')()

var mongoose = require('models/mongo/mongoose-control')
var Template = require('models/mongo/template')
var async = require('async')
var fs = require('fs')
var exists = require('101/exists')

var dryRun = !process.env.ACTUALLY_RUN
console.log('dryRun?', !!dryRun)
console.log('mongo', process.env.MONGO)

async.waterfall([
  mongoose.start.bind(mongoose),
  function readDirectory (cb) {
    fs.readdir(__dirname, function (err, files) {
      if (err) { return cb(err) }
      cb(null, files.filter(function (n) {
        return /.+\.json$/.test(n)
      }))
    })
  },
  function upsertFiles (files, cb) {
    async.map(files, function (file, eachCb) {
      var templateData = require('./' + file)
      // set template name from the name of the file
      templateData.name = file.replace('.json', '')
      var query = {
        lowerName: templateData.name.toLowerCase()
      }
      var opts = {
        upsert: true
      }
      if (dryRun) {
        console.log('dry run, finding', query.from)
        Template.findOne(query, eachCb)
      } else {
        console.log('updating', query.lowerName)
        Template.findOneAndUpdate(query, templateData, opts, eachCb)
      }
    }, cb)
  },
  function printUpdates (templates, cb) {
    if (dryRun) {
      var count = templates.filter(exists).length
      console.log('found dis many', count)
    } else {
      console.log('updated dis many', templates.length)
    }
    cb()
  }
], function (err) {
  if (err) {
    throw err
  } else {
    process.exit(0)
  }
})
