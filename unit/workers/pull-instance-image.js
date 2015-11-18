/**
 * @module unit/workers/on-instance-image-pull
 */
var Boom = require('dat-middleware').Boom
var expect = require('code').expect
var Lab = require('lab')
var ObjectId = require('mongoose').Types.ObjectId
var Promise = require('bluebird')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance')
var Mavis = require('models/apis/mavis')
var PullInstanceImageWorker = require('workers/pull-instance-image')
var rabbitMQ = require('models/rabbitmq')
var toObjectId = require('utils/to-object-id')

var lab = exports.lab = Lab.script()
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var describe = lab.describe
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var newMockInstance = function (job) {
  return new Instance({
    _id: job.instanceId,
    contextVersion: {
      _id: new ObjectId(),
      build: {
        dockerTag: 'dockerTag:latest'
      }
    },
    build: job.buildId
  })
}

describe('pullInstanceImageWorker: ' + moduleName, function () {
  var ctx
  beforeEach(function (done) {
    ctx = {}
    ctx.job = {
      instanceId: '111122223333444455556666',
      buildId: '000011112222333344445555',
      sessionUserGithubId: '10',
      ownerUsername: 'ownerUsername'
    }
    ctx.mockInstance = newMockInstance(ctx.job)
    sinon.stub(Instance, 'findOneAsync')
    sinon.stub(Mavis.prototype, 'findDockForContainerAsync')
    sinon.stub(Instance.prototype, 'modifyImagePullAsync')
    sinon.stub(Docker.prototype, 'pullImageAsync')
    sinon.stub(Instance.prototype, 'modifyUnsetImagePullAsync')
    sinon.stub(rabbitMQ, 'createInstanceContainer')
    done()
  })
  afterEach(function (done) {
    Instance.findOneAsync.restore()
    Instance.prototype.modifyImagePullAsync.restore()
    Mavis.prototype.findDockForContainerAsync.restore()
    Docker.prototype.pullImageAsync.restore()
    Instance.prototype.modifyUnsetImagePullAsync.restore()
    rabbitMQ.createInstanceContainer.restore()
    done()
  })

  describe('success', function () {
    beforeEach(function (done) {
      ctx.dockerHost = 'http://localhost:4243'
      Instance.findOneAsync
        .returns(Promise.resolve(ctx.mockInstance))
      Instance.prototype.modifyImagePullAsync
        .returns(Promise.resolve(ctx.mockInstance))
      Mavis.prototype.findDockForContainerAsync
        .returns(Promise.resolve(ctx.dockerHost))
      Docker.prototype.pullImageAsync
        .returns(Promise.resolve())
      Instance.prototype.modifyUnsetImagePullAsync
        .returns(Promise.resolve(ctx.mockInstance))
      rabbitMQ.createInstanceContainer
        .returns(Promise.resolve())
      done()
    })

    it('should pull image', function (done) {
      PullInstanceImageWorker(ctx.job).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledWith(Instance.findOneAsync, {
          _id: toObjectId(ctx.job.instanceId),
          build: toObjectId(ctx.job.buildId)
        })
        sinon.assert.calledWith(
          Mavis.prototype.findDockForContainerAsync,
          ctx.mockInstance.contextVersion
        )
        sinon.assert.calledWith(
          Instance.prototype.modifyImagePullAsync,
          ctx.mockInstance.contextVersion._id, {
            dockerTag: ctx.mockInstance.contextVersion.build.dockerTag,
            dockerHost: ctx.dockerHost,
            sessionUser: {
              github: ctx.job.sessionUserGithubId
            },
            ownerUsername: ctx.job.ownerUsername
          }
        )
        sinon.assert.calledWith(
          Docker.prototype.pullImageAsync,
          ctx.mockInstance.contextVersion.build.dockerTag
        )
        done()
      })
    })
  })

  describe('db state changed', function () {
    describe('instance.findOneAsync instance not found', function () {
      beforeEach(function (done) {
        ctx.dockerHost = 'http://localhost:4243'
        Instance.findOneAsync
          .returns(Promise.resolve(null))
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(TaskFatalError)
          expect(err.data.originalError).to.exist()
          expect(err.data.originalError.message).to.match(/instance not found.*build/)
          done()
        })
      })
    })
    describe('instance.modifyImagePullAsync instance not found', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .returns(Promise.resolve(null))
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(TaskFatalError)
          expect(err.data.originalError).to.exist()
          expect(err.data.originalError.message).to.match(/instance not found.*version/)
          done()
        })
      })
    })
    describe('instance.modifyUnsetImagePullAsync instance not found', function () {
      beforeEach(function (done) {
        ctx.dockerHost = 'http://localhost:4243'
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Mavis.prototype.findDockForContainerAsync
          .returns(Promise.resolve(ctx.dockerHost))
        Docker.prototype.pullImageAsync
          .returns(Promise.resolve())
        Instance.prototype.modifyUnsetImagePullAsync
          .returns(Promise.resolve(null))
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(TaskFatalError)
          expect(err.data.originalError).to.exist()
          expect(err.data.originalError.message).to.match(/instance.*pulling.*not found/)
          done()
        })
      })
    })
  })

  describe('errors', function () {
    describe('instance.findOneAsync err', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findOneAsync.throws(ctx.err)
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })
    describe('instance.modifyImagePullAsync err', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .throws(ctx.err)
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })
    describe('mavis.findDockForContainerAsync err', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Mavis.prototype.findDockForContainerAsync
          .throws(ctx.err)
        done()
      })

      it('should throw the err', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })
    describe('docker.pullImageAsync err', function () {
      beforeEach(function (done) {
        ctx.err = new Error()
        ctx.dockerHost = 'http://localhost:4243'
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Mavis.prototype.findDockForContainerAsync
          .returns(Promise.resolve(ctx.dockerHost))
        Docker.prototype.pullImageAsync
          .throws(ctx.err)
        done()
      })

      it('docker.pullImageAsync', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(expectErr(ctx.err, done))
      })
    })
    describe('docker.pullImageAsync "image not found" err', function () {
      beforeEach(function (done) {
        ctx.err = Boom.notFound('Follow pull image failed: image dockerTag: not found', {
          err: 'image dockerTag: not found' // err is a string
        })
        ctx.dockerHost = 'http://localhost:4243'
        Instance.findOneAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Instance.prototype.modifyImagePullAsync
          .returns(Promise.resolve(ctx.mockInstance))
        Mavis.prototype.findDockForContainerAsync
          .returns(Promise.resolve(ctx.dockerHost))
        Docker.prototype.pullImageAsync
          .throws(ctx.err)
        done()
      })

      it('docker.pullImageAsync', function (done) {
        PullInstanceImageWorker(ctx.job).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceOf(TaskFatalError)
          expect(err.data.originalError).to.equal(ctx.err)
          done()
        })
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
