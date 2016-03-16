'use strict'

var assign = require('101/assign')
var fs = require('fs')
var noop = require('101/noop')
var mongoose = require('mongoose')

var log = require('middlewares/logger')(__filename).log

var mongooseControl = module.exports = {}

mongooseControl.start = function (cb) {
  cb = cb || noop
  var ssl
  if (process.env.MONGO_CACERT &&
      process.env.MONGO_CERT &&
      process.env.MONGO_KEY
  ) {
    try {
      log.info('loading mongodb certificates')
      var ca = fs.readFileSync(process.env.MONGO_CACERT, 'utf-8')
      var key = fs.readFileSync(process.env.MONGO_KEY, 'utf-8')
      var cert = fs.readFileSync(process.env.MONGO_CERT, 'utf-8')
      ssl = {
        ssl: true,
        sslValidate: true,
        sslCA: ca,
        sslKey: key,
        sslCert: cert
      }
    } catch (err) {
      log.fatal({
        err: err
      }, 'could not read provided mongo certificates')
      return cb(err)
    }
  }

  var mongooseOptions = {}

  if (process.env.MONGO_REPLSET_NAME) {
    mongooseOptions.replset = {
      rs_name: process.env.MONGO_REPLSET_NAME
    }
    if (ssl) {
      mongooseOptions = assign(mongooseOptions, { replset: ssl })
      log.trace('mongodb connecting to replset with ssl')
    }
  } else if (ssl) {
    mongooseOptions = assign(mongooseOptions, { server: ssl })
    log.trace('mongodb connecting to server with ssl')
  }

  mongoose.connect(process.env.MONGO, mongooseOptions, cb)
}

mongooseControl.stop = function (cb) {
  cb = cb || noop
  mongoose.disconnect(function (err) {
    // this sometimes calls back in sync
    process.nextTick(function () {
      cb(err)
    })
  })
}
