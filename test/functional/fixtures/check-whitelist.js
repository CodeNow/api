'use strict'

var UserWhitelist = require('models/mongo/user-whitelist')
var pluck = require('101/pluck')
var expect = require('code').expect

module.exports = function validateMongoWhitelist (names, cb) {
  UserWhitelist.find({}, function (err, docs) {
    if (err) { return cb(err) }
    expect(docs).to.have.length(names.length)
    if (names.length) {
      expect(docs.map(pluck('name'))).to.only.contain(names)
    }
    cb()
  })
}
