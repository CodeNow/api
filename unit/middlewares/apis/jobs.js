'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var rabbitMQ = require('../../../lib/models/rabbitmq/index.js')
var Github = require('../../../lib/models/apis/github.js')
var jobs = require('../../../lib/middlewares/apis/jobs.js')

var sinon = require('sinon')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('lib/middlewares/apis/jobs.js unit test: ' + moduleName, function () {
  describe('publishASGCreate', function () {
    var testReq = {
      body: {
        name: 'nemo'
      }
    }
    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserByUsername')
      sinon.stub(rabbitMQ, 'publishASGCreate')
      done()
    })

    afterEach(function (done) {
      Github.prototype.getUserByUsername.restore()
      rabbitMQ.publishASGCreate.restore()
      done()
    })

    describe('getUserByUsername errs', function () {
      it('should return error', function (done) {
        var testErr = new Error('ice storm')
        Github.prototype.getUserByUsername.yieldsAsync(testErr)
        jobs.publishASGCreate(testReq, {}, function (err) {
          expect(err).to.deep.equal(testErr)
          done()
        })
      })
      it('should return badRequest', function (done) {
        Github.prototype.getUserByUsername.yieldsAsync(null, null)
        jobs.publishASGCreate(testReq, {}, function (err) {
          expect(err.output.statusCode).to.equal(400)
          done()
        })
      })
    }) // end getUserByUsername errs
    describe('getUserByUsername successful', function () {
      var testId = 24182934
      var testData = {
        id: testId
      }
      beforeEach(function (done) {
        Github.prototype.getUserByUsername.yieldsAsync(null, testData)
        done()
      })
      it('should publish job', function (done) {
        jobs.publishASGCreate(testReq, {}, function (err) {
          expect(err).to.not.exist()
          expect(rabbitMQ.publishASGCreate
            .withArgs({
              githubId: testId.toString()
            }).called).to.be.true()
          done()
        })
      })
    }) // end getUserByUsername successful
  }) // end publishASGCreate successful

  describe('publishClustersDeprovision', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'publishClusterDeprovision')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.publishClusterDeprovision.restore()
      done()
    })
    it('should call publishClusterDeprovision for each user id', function (done) {
      jobs.publishClustersDeprovision({}, {}, function (err) {
        expect(err).to.not.exist()
        var userIds = process.env.TEST_GITHUB_USER_IDS.split(',').map(function (id) {
          return id.trim()
        })
        expect(rabbitMQ.publishClusterDeprovision.callCount).to.equal(userIds.length)
        expect(rabbitMQ.publishClusterDeprovision.getCall(0).args[0].githubId).to.equal(userIds[0])
        expect(rabbitMQ.publishClusterDeprovision.getCall(userIds.length - 1).args[0].githubId)
          .to.equal(userIds[userIds.length - 1])
        done()
      })
    })
  }) // end publishClustersDeprovision successful
})
