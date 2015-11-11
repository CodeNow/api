'use strict'
require('loadenv')()
var crypto = require('crypto')
var InfraCodeVersion = require('models/mongo/infra-code-version.js')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
var async = require('async')

async.waterfall([
  getAllInfra,
  eachInfra
], function (err) {
  if (err) {
    return console.log('ERROR', err.stack)
  }
  console.log('done everything went well')
  mongoose.disconnect()
})

function getAllInfra (cb) {
  console.log('getAllInfra')
  InfraCodeVersion.find({
    'files': {
      $elemMatch: {
        isDir: false,
        hash: { $regex: /^\$/ } // find only bcrypt files
      }
    }
  }, cb)
}

function hashString (data, cb) {
  var md5 = crypto.createHash('md5')
  data = data
    .replace(/[\s\uFEFF\xA0]+\n/g, '\n') // trim whitespace after line
    .replace(/\n[\s\uFEFF\xA0]*\n/g, '\n') // remove blank lines
    .replace(/^[\s\uFEFF\xA0]*\n/g, '') // remove start of file blank lines
    .replace(/[\s\uFEFF\xA0]+$/g, '\n')
  var hash = md5.update(data, 'utf8').digest('hex')
  cb(null, hash)
}

function eachInfra (infras, cb) {
  console.log('eachInfra')
  if (!infras || infras.length === 0) {
    return cb()
  }
  // get all infracodes
  async.eachLimit(infras, 1000, function (infra, cb) {
    console.log('eachInfra:infra', infra._id)
    // for each file

    async.each(infra.files, function (file, cb) {
      if (file.isDir) { return cb() }

      console.log('eachInfra:infra:file', infra._id, file._id)
      var filePath = file.Key.substr(file.Key.indexOf('/source') + 7)
      // get contance of file
      infra.bucket().getFile(filePath, file.VersionId, file.ETag, function (err, data) {
        if (err) { return cb(err) }

        // create hash of file
        hashString(data.Body.toString(), function (err, hash) {
          if (err) { return cb(err) }

          file.hash = hash
          console.log('eachInfra:infra:file:hash', infra._id, file._id, file.hash)
          // update mongo of file with hash
          InfraCodeVersion.update({
            _id: infra._id,
            'files._id': file._id
          }, {
            $set: {
              'files.$': file
            }
          }, cb)
        })
      })
    }, cb)
  }, cb)
}
