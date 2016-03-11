/**
 * @module unit/workers/base-worker
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var domain = require('domain')
var noop = require('101/noop')
var put = require('101/put')
var sinon = require('sinon')

var BaseWorker = require('workers/base-worker')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var messenger = require('socket/messenger')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('BaseWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.populateModelsSpy = sinon.spy(function (cb) {
      cb(null)
    })
    ctx.populateOwnerAndCreatedBySpy = sinon.spy(function (user, cb) {
      cb(null)
    })
    ctx.data = {
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343',
      instanceId: 'dsw4t345623uh53o4hu5'
    }
    ctx.mockUser = {
      _id: 'foo',
      toJSON: noop,
      github: '',
      username: '',
      gravatar: ''
    }
    ctx.dockerContainerId = 'asdasdasd'
    ctx.mockContextVersion = {
      toJSON: noop
    }
    ctx.mockBuild = {
      '_id': 'dsfadsfadsfadsfasdf',
      name: 'name1'
    }
    ctx.mockContainer = {
      dockerContainer: ctx.data.dockerContainer,
      dockerHost: ctx.data.dockerHost
    }
    ctx.mockInstanceSparse = {
      '_id': ctx.data.instanceId,
      name: 'name1',
      populateModels: function () {},
      populateOwnerAndCreatedBy: function () {},
      container: ctx.mockContainer
    }
    ctx.mockInstance = put({
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      }
    }, ctx.mockInstanceSparse)
    ctx.worker = new BaseWorker(ctx.data)
    done()
  })

  describe('constructor', function () {
    it('should use uuid from domain.runnableData', function (done) {
      var d = domain.create()
      d.runnableData = {tid: 'foobar'}
      d.run(function () {
        var b = new BaseWorker()
        expect(b.logData.uuid).to.equal('foobar')
        done()
      })
    })
  })

  describe('getRunnableData', function () {
    it('should return an object with a tid', function (done) {
      var runnableData = BaseWorker.getRunnableData()
      expect(runnableData.tid).to.be.a.string()
      done()
    })
  })

  describe('_baseWorkerFindContextVersion', function () {
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findOne', function (query, cb) {
          cb(null, ctx.mockContextVersion)
        })
        done()
      })
      afterEach(function (done) {
        ContextVersion.findOne.restore()
        done()
      })
      it('should query for contextversion', function (done) {
        ctx.worker._baseWorkerFindContextVersion({}, function (err) {
          expect(err).to.be.null()
          expect(ctx.worker.contextVersion).to.equal(ctx.mockContextVersion)
          done()
        })
      })
    })
  })

  describe('_baseWorkerUpdateInstanceFrontend', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, ctx.mockInstanceSparse)
      sinon.stub(ctx.mockInstanceSparse, 'populateModels').yieldsAsync(null)
      sinon.stub(ctx.mockInstanceSparse, 'populateOwnerAndCreatedBy')
        .yieldsAsync(null, ctx.mockInstance)
      sinon.stub(messenger, 'emitInstanceUpdate')
      sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      User.findByGithubId.restore()
      ctx.mockInstanceSparse.populateModels.restore()
      ctx.mockInstanceSparse.populateOwnerAndCreatedBy.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })
    describe('success', function () {
      it('should fetch the instance with the id and emit the update', function (done) {
        ctx.worker._baseWorkerUpdateInstanceFrontend(ctx.mockInstance._id, ctx.mockUser._id,
          'starting',
          function (err) {
            expect(err).to.be.undefined()
            expect(User.findByGithubId.callCount).to.equal(1)
            expect(User.findByGithubId.args[0][0]).to.equal(ctx.mockUser._id)
            expect(Instance.findOne.callCount).to.equal(1)
            expect(Instance.findOne.args[0][0]).to.deep.equal({_id: ctx.mockInstance._id})
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1)
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1)
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
              .to.deep.equal(ctx.worker.user)
            expect(
              messenger.emitInstanceUpdate.callCount,
              'emitContextVersionUpdate'
            ).to.equal(1)
            expect(
              messenger.emitInstanceUpdate.args[0][0],
              'emitContextVersionUpdate arg0'
            ).to.equal(ctx.mockInstance)
            expect(
              messenger.emitInstanceUpdate.args[0][1],
              'emitContextVersionUpdate arg0'
            ).to.equal('starting')
            done()
          })
      })
      it('should fetch the instance with a query and emit the update', function (done) {
        var query = {
          'contextVersion._id': 'dsafasdfasdfds'
        }
        ctx.worker._baseWorkerUpdateInstanceFrontend(query, ctx.mockUser._id,
          'starting',
          function (err) {
            expect(err).to.be.undefined()
            expect(User.findByGithubId.callCount).to.equal(1)
            expect(User.findByGithubId.args[0][0]).to.equal(ctx.mockUser._id)
            expect(Instance.findOne.callCount).to.equal(1)
            expect(Instance.findOne.args[0][0]).to.deep.equal(query)
            expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1)
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1)
            expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.args[0][0])
              .to.deep.equal(ctx.worker.user)
            expect(
              messenger.emitInstanceUpdate.callCount,
              'emitContextVersionUpdate'
            ).to.equal(1)
            expect(
              messenger.emitInstanceUpdate.args[0][0],
              'emitContextVersionUpdate arg0'
            ).to.equal(ctx.mockInstance)
            expect(
              messenger.emitInstanceUpdate.args[0][1],
              'emitContextVersionUpdate arg0'
            ).to.equal('starting')
            done()
          })
      })
      describe('failure', function () {
        describe('failing on any of the external methods', function () {
          var testError = new Error('Generic Database error')
          it('should fail and return with the user call', function (done) {
            User.findByGithubId.yieldsAsync(testError)
            ctx.worker._baseWorkerUpdateInstanceFrontend(
              ctx.mockInstance._id,
              ctx.mockUser._id,
              'starting',
              function (err) {
                expect(err).to.equal(testError)
                expect(User.findByGithubId.callCount).to.equal(1)

                expect(Instance.findOne.callCount).to.equal(0)
                done()
              })
          })
          it('should fail and return in findOne', function (done) {
            Instance.findOne.yieldsAsync(testError)
            ctx.worker._baseWorkerUpdateInstanceFrontend(
              ctx.mockInstance._id,
              ctx.mockUser._id,
              'starting',
              function (err) {
                expect(err).to.equal(testError)

                expect(User.findByGithubId.callCount).to.equal(1)
                expect(User.findByGithubId.args[0][0]).to.equal(ctx.mockUser._id)

                expect(Instance.findOne.callCount).to.equal(1)
                expect(Instance.findOne.args[0][0]).to.deep.equal({_id: ctx.mockInstance._id})
                expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(0)
                done()
              })
          })
          it('should fail and return in findOne when no instance found', function (done) {
            Instance.findOne.yieldsAsync()
            ctx.worker._baseWorkerUpdateInstanceFrontend(
              ctx.mockInstance._id,
              ctx.mockUser._id,
              'starting',
              function (err) {
                expect(err.message).to.equal('instance not found')
                expect(Instance.findOne.callCount).to.equal(1)
                expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(0)
                done()
              })
          })
          it('should fail and return in ctx.mockInstanceSparse', function (done) {
            ctx.mockInstanceSparse.populateModels.yieldsAsync(testError)
            ctx.worker._baseWorkerUpdateInstanceFrontend(
              ctx.mockInstance._id,
              ctx.mockUser._id,
              'starting',
              function (err) {
                expect(err).to.equal(testError)
                expect(Instance.findOne.callCount).to.equal(1)
                expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1)
                expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(0)
                done()
              })
          })
          it('should fail and return in ctx.mockInstanceSparse', function (done) {
            ctx.mockInstanceSparse.populateOwnerAndCreatedBy.yieldsAsync(testError)
            ctx.worker._baseWorkerUpdateInstanceFrontend(
              ctx.mockInstance._id,
              ctx.mockUser._id,
              'starting',
              function (err) {
                expect(err).to.equal(testError)
                expect(Instance.findOne.callCount).to.equal(1)
                expect(ctx.mockInstanceSparse.populateModels.callCount).to.equal(1)
                expect(ctx.mockInstanceSparse.populateOwnerAndCreatedBy.callCount).to.equal(1)
                expect(messenger.emitInstanceUpdate.callCount).to.equal(0)
                done()
              })
          })
        })
      })
    })
  })

  describe('_baseWorkerValidateData', function () {
    it('should call back with error if event data does not contain required keys', function (done) {
      ctx.worker._baseWorkerValidateData(['hello'], function (err) {
        expect(err.message).to.equal('_baseWorkerValidateData: event data missing keypath: hello')
        done()
      })
    })
    it('should call back nothing if event data does not contain required keys', function (done) {
      ctx.worker._baseWorkerValidateData(['uuid'], function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
  })

  describe('_baseWorkerValidateDieData', function () {
    it('should call back with error if event data does not contain required keys', function (done) {
      delete ctx.worker.data.uuid
      ctx.worker._baseWorkerValidateDieData(function (err) {
        expect(err.message).to.equal('_baseWorkerValidateData: event data missing keypath: uuid')
        done()
      })
    })

    it('should call back without error if event data contains all required keys', function (done) {
      ctx.worker._baseWorkerValidateDieData(function (err) {
        expect(err).to.be.undefined()
        done()
      })
    })
  })

  describe('_baseWorkerFindInstance', function () {
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, ctx.mockInstance)
        })
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should query mongo for instance w/ container', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err).to.be.null()
          expect(Instance.findOne.callCount).to.equal(1)
          expect(Instance.findOne.args[0][0]).to.only.contain({
            '_id': ctx.data.instanceId,
            'container.dockerContainer': ctx.data.dockerContainer
          })
          expect(Instance.findOne.args[0][1]).to.be.a.function()
          done()
        })
      })
    })

    describe('found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, ctx.mockInstance)
        })
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should callback successfully if instance w/ container found', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err).to.be.null()
          expect(ctx.worker.instance).to.equal(ctx.mockInstance)
          done()
        })
      })
    })

    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(null, null)
        })
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should callback error if instance w/ container not found', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err.message).to.equal('instance not found')
          expect(ctx.worker.instance).to.be.undefined()
          done()
        })
      })
    })

    describe('mongo error', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne', function (data, cb) {
          cb(new Error('mongoose error'), null)
        })
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should callback error if mongo error', function (done) {
        ctx.worker._baseWorkerFindInstance({
          _id: ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        }, function (err) {
          expect(err.message).to.equal('mongoose error')
          expect(ctx.worker.instance).to.be.undefined()
          done()
        })
      })
    })
  })
})
