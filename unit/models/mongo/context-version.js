'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var ContextVersion = require('models/mongo/context-version')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)

describe('Context Version Unit Test', function () {
  describe('recover', function () {
    var updatedCv
    var contextVersion
    beforeEach(function (done) {
      updatedCv = {
        dockRemoved: false
      }
      contextVersion = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: 'context-id'
      })
      sinon.stub(ContextVersion, 'findOneAndUpdate').yieldsAsync(null, updatedCv)
      done()
    })
    afterEach(function (done) {
      ContextVersion.findOneAndUpdate.restore()
      done()
    })
    it('should return success', function (done) {
      ContextVersion.recover(contextVersion._id, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate,
          {'_id': contextVersion._id, 'dockRemoved': true},
          {$set: {'dockRemoved': false}},
          sinon.match.func)
        done()
      })
    })
    it('should cb error', function (done) {
      var error = new Error('DB Error!')
      ContextVersion.findOneAndUpdate.yieldsAsync(error)
      ContextVersion.recover(contextVersion._id, function (err) {
        expect(err).to.equal(error)
        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate,
          {'_id': contextVersion._id, 'dockRemoved': true},
          {$set: {'dockRemoved': false}},
          sinon.match.func)
        done()
      })
    })
  })
})
