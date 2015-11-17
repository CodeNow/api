/**
 * @module unit/workers/on-instance-image-pull
 */
var expect = require('code').expect
var Lab = require('lab')
var ObjectId = require('mongoose').Types.ObjectId
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var Instance = require('models/mongo/instance')
var rabbitMQ = require('models/rabbitmq')
var OnInstanceImagePullWorker = require('workers/on-instance-image-pull')

var lab = exports.lab = Lab.script()
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var describe = lab.describe
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var newMockInstance = function (job) {
  return new Instance({
    _id: new ObjectId(),
    contextVersion: {
      _id: new ObjectId()
    },
    imagePull: {
      dockerTag: job.dockerTag,
      dockerHost: job.dockerHost,
      ownerUsername: 'ownerUsername',
      sessionUser: {
        github: 10
      }
    }
  })
}

describe('OnInstanceImagePullWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.job = {
      dockerTag: 'dockerTag',
      dockerHost: 'http://localhost:4243'
    }
    ctx.mockInstances = [
      newMockInstance(ctx.job),
      newMockInstance(ctx.job),
      newMockInstance(ctx.job)
    ]
    sinon.stub(Instance, 'findAsync')
    sinon.stub(Instance.prototype, 'modifyUnsetImagePullAsync')
    sinon.stub(rabbitMQ, 'createInstanceContainer')
    done()
  })
  afterEach(function (done) {
    Instance.findAsync.restore()
    Instance.prototype.modifyUnsetImagePullAsync.restore()
    rabbitMQ.createInstanceContainer.restore()
    done()
  })

  describe('success', function () {
    beforeEach(function (done) {
      Instance.findAsync
        .returns(Promise.resolve(ctx.mockInstances))
      Instance.prototype.modifyUnsetImagePullAsync
        .onCall(0).returns(Promise.resolve(ctx.mockInstances[0]))
        .onCall(1).returns(Promise.resolve(ctx.mockInstances[1]))
        .onCall(2).returns(Promise.resolve(ctx.mockInstances[2]))
      done()
    })

    it('should unset imagePull and create-instance-container jobs', function (done) {
      OnInstanceImagePullWorker(ctx.job).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledWith(Instance.findAsync, {
          'imagePull.dockerTag': ctx.job.dockerTag,
          'imagePull.dockerHost': ctx.job.dockerHost
        })
        sinon.assert.callCount(
          Instance.prototype.modifyUnsetImagePullAsync,
          ctx.mockInstances.length
        )
        sinon.assert.calledWith(
          Instance.prototype.modifyUnsetImagePullAsync,
          ctx.job.dockerHost,
          ctx.job.dockerTag
        )
        done()
      })
    })
  })

  describe('errors', function () {
    describe('instance with image pull not found', function () {
      beforeEach(function (done) {
        Instance.findAsync
          .returns(Promise.resolve(ctx.mockInstances))
        Instance.prototype.modifyUnsetImagePullAsync
          .onCall(0).returns(Promise.resolve(null))
          .onCall(1).returns(Promise.resolve(null))
          .onCall(2).returns(Promise.resolve(null))
        done()
      })
      it('should throw a TaskFatalError', function (done) {
        OnInstanceImagePullWorker(ctx.job).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(TaskFatalError)
          expect(err.message).to.match(/instance.*not found/)
          done()
        })
      })
    })

    describe('findAsync error', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findAsync.throws(ctx.err)
        done()
      })

      it('should throw the findAsync error', function (done) {
        OnInstanceImagePullWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })

    describe('modifyUnsetImagePullAsync error', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findAsync
          .returns(Promise.resolve(ctx.mockInstances))
        Instance.prototype.modifyUnsetImagePullAsync
          .onCall(0).throws(ctx.err)
          .onCall(1).throws(ctx.err)
          .onCall(2).throws(ctx.err)
        done()
      })

      it('should throw the modifyUnsetImagePullAsync error', function (done) {
        OnInstanceImagePullWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })

    describe('createInstanceContainer error', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findAsync
          .returns(Promise.resolve(ctx.mockInstances))
        Instance.prototype.modifyUnsetImagePullAsync
          .onCall(0).returns(Promise.resolve(ctx.mockInstances[0]))
          .onCall(1).returns(Promise.resolve(ctx.mockInstances[1]))
          .onCall(2).returns(Promise.resolve(ctx.mockInstances[2]))
        rabbitMQ.createInstanceContainer.throws(ctx.err)
        done()
      })

      it('should throw the createInstanceContainer error', function (done) {
        OnInstanceImagePullWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })
  })

  function expectErr (expectedErr, done) {
    return function (err) {
      expect(err).to.exist()
      expect(err).to.equal(expectedErr)
      done()
    }
  }
})
