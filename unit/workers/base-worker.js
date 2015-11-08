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
var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
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
    ctx.modifyContainerInspectSpy =
      sinon.spy(function (dockerContainerId, inspect, cb) {
        cb(null, ctx.mockContainer)
      })
    ctx.modifyContainerInspectErrSpy = sinon.spy(function (dockerContainerId, error, cb) {
      cb(null)
    })
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
      container: ctx.mockContainer,
      removeStartingStoppingStates: ctx.removeStartingStoppingStatesSpy,
      modifyContainerInspect: ctx.modifyContainerInspectSpy,
      modifyContainerInspectErr: ctx.modifyContainerInspectErrSpy
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

  describe('_baseWorkerUpdateContextVersionFrontend', function () {
    beforeEach(function (done) {
      ctx.worker.contextVersion = ctx.mockContextVersion
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })
    afterEach(function (done) {
      messenger.emitContextVersionUpdate.restore()
      ctx.worker._baseWorkerFindContextVersion.restore()
      done()
    })
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerFindContextVersion')
          .yieldsAsync(null, ctx.mockContextVersion)
        done()
      })

      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('build_running', function (err) {
          expect(err).to.be.null()
          expect(ctx.worker._baseWorkerFindContextVersion.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerFindContextVersion.args[0][0]).to.deep.equal({
            '_id': ctx.mockContextVersion._id
          })
          expect(ctx.worker._baseWorkerFindContextVersion.args[0][1]).to.be.a.function()
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1)
          expect(
            messenger.emitContextVersionUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockContextVersion)
          expect(
            messenger.emitContextVersionUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('build_running')
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_baseWorkerFindContextVersion').yieldsAsync(new Error('error'))
        done()
      })
      it('should fail with an invalid event message', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('dsfasdfasdfgasdf', function (err) {
          expect(err.message).to.equal('Attempted status update contained invalid event')
          done()
        })
      })
      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._baseWorkerUpdateContextVersionFrontend('build_running', function (err) {
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(0)
          expect(err.message).to.equal('error')
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

  describe('pFindInstance', function () {
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
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.dockerContainerId
        })
          .then(function () {
            expect(Instance.findOne.callCount).to.equal(1)
            expect(Instance.findOne.args[0][0]).to.only.contain({
              '_id': ctx.data.instanceId,
              'container.dockerContainer': ctx.dockerContainerId
            })
            expect(Instance.findOne.args[0][1]).to.be.a.function()
            done()
          })
          .catch(done)
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
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.dockerContainerId
        })
          .then(function () {
            expect(ctx.worker.instance).to.equal(ctx.mockInstance)
            done()
          })
          .catch(done)
      })
    })

    describe('not found', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne').yieldsAsync(null, null)
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should callback error if instance w/ container not found', function (done) {
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        })
          .catch(function (err) {
            expect(err.message).to.equal('instance not found')
            expect(ctx.worker.instance).to.be.undefined()
            done()
          })
          .catch(done)
      })
    })

    describe('mongo error', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne').yieldsAsync(new Error('mongoose error'))
        done()
      })
      afterEach(function (done) {
        Instance.findOne.restore()
        done()
      })
      it('should callback error if mongo error', function (done) {
        ctx.worker.pFindInstance({
          '_id': ctx.data.instanceId,
          'container.dockerContainer': ctx.data.dockerContainer
        })
          .catch(function (err) {
            expect(err.message).to.equal('mongoose error')
            expect(ctx.worker.instance).to.be.undefined()
            done()
          })
          .catch(done)
      })
    })
  })

  describe('_baseWorkerInspectContainerAndUpdate', function () {
    beforeEach(function (done) {
      // normally set by _findInstance & _findUser
      ctx.worker.instance = ctx.mockInstance
      ctx.worker.user = ctx.mockUser
      ctx.worker.docker = new Docker('0.0.0.0')
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(null, ctx.mockContainer)
        })
        done()
      })

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore()
        done()
      })

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err).to.be.undefined()
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1)
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1)
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0)
          done()
        })
      })
    })

    describe('error inspect', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(new Error('docker inspect error'))
        })
        done()
      })

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore()
        done()
      })

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err.message).to.equal('docker inspect error')
          expect(Docker.prototype.inspectContainer.callCount)
            .to.equal(process.env.WORKER_INSPECT_CONTAINER_NUMBER_RETRY_ATTEMPTS)
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(0)
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(1)
          done()
        })
      })
    })

    describe('error update mongo', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (dockerContainerId, cb) {
          cb(null, ctx.mockContainer)
        })
        ctx.modifyContainerInspectSpy = sinon.spy(function (dockerContainerId, inspect, cb) {
          cb(new Error('mongoose error'))
        })
        ctx.mockInstance.modifyContainerInspect = ctx.modifyContainerInspectSpy
        done()
      })

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore()
        done()
      })

      it('should inspect a container and update the database', function (done) {
        ctx.worker._baseWorkerInspectContainerAndUpdate(function (err) {
          expect(err.message).to.equal('mongoose error')
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1)
          expect(ctx.modifyContainerInspectSpy.callCount).to.equal(1)
          expect(ctx.modifyContainerInspectErrSpy.callCount).to.equal(0)
          done()
        })
      })
    })
  })

  describe('_pBaseWorkerFindBuild', function () {
    var query = {
      '_id': 'dfasdfasdf'
    }
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(null, ctx.mockBuild)
        })
        done()
      })
      afterEach(function (done) {
        Build.findOne.restore()
        done()
      })
      it('should query mongo for build', function (done) {
        ctx.worker._pBaseWorkerFindBuild(query)
          .then(function () {
            expect(Build.findOne.callCount).to.equal(1)
            expect(Build.findOne.args[0][0]).to.only.contain({
              '_id': 'dfasdfasdf'
            })
            expect(Build.findOne.args[0][1]).to.be.a.function()
            done()
          })
          .catch(done)
      })
    })

    describe('found', function () {
      beforeEach(function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(null, ctx.mockBuild)
        })
        done()
      })
      afterEach(function (done) {
        Build.findOne.restore()
        done()
      })
      it('should callback successfully if instance w/ container found', function (done) {
        ctx.worker._pBaseWorkerFindBuild(query)
          .then(function (build) {
            expect(build).to.equal(ctx.mockBuild)
            expect(ctx.worker.build).to.equal(ctx.mockBuild)
            done()
          })
          .catch(done)
      })
    })

    describe('Errors', function () {
      afterEach(function (done) {
        Build.findOne.restore()
        done()
      })
      it('should callback error if build not found', function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb()
        })
        ctx.worker._pBaseWorkerFindBuild(query)
          .catch(function (err) {
            expect(err.message).to.equal('Build not found')
            expect(ctx.worker.build).to.be.undefined()
            done()
          })
          .catch(done)
      })
      it('should callback error if mongo error', function (done) {
        sinon.stub(Build, 'findOne', function (id, cb) {
          cb(new Error('mongoose error'))
        })
        ctx.worker._pBaseWorkerFindBuild(query)
          .catch(function (err) {
            expect(err.message).to.equal('mongoose error')
            expect(ctx.worker.build).to.be.undefined()
            done()
          })
          .catch(done)
      })
    })
  })
})
