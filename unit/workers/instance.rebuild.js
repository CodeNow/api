'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')
var Runnable = require('runnable')
var Instance = require('models/mongo/instance')

var sinon = require('sinon')
var Worker = require('workers/instance.rebuild')
var TaskFatalError = require('ponos').TaskFatalError

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: instance.rebuild unit test: ' + moduleName, function () {
  var testInstanceId = '507f1f77bcf86cd799439011'
  var testData = {
    instanceId: testInstanceId
  }

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Runnable.prototype, 'githubLogin')
      sinon.stub(Instance, 'findById')
      done()
    })

    afterEach(function (done) {
      Runnable.prototype.githubLogin.restore()
      Instance.findById.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing a instanceId', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('Value does not exist')
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
          done()
        })
      })
    })

    describe('user login fails', function () {
      var loginError = new Error('Login failed')
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(loginError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(loginError.message)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            done()
          })
      })
    })

    describe('instance lookup fails', function () {
      var fetchError = new Error('Fetch error')
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        var rejectionPromise = Promise.reject(fetchError)
        rejectionPromise.suppressUnhandledRejections()
        Instance.findById.returns(rejectionPromise)
        done()
      })
      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(fetchError.message)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            done()
          })
      })
    })

    describe('instance not found', function () {
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.returns(Promise.resolve(null))
        done()
      })
      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Instance not found')
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            done()
          })
      })
    })

    describe('build deep copy failed', function () {
      var deepCopyError = new Error('Deep copy error')
      var testInstance = {
        _id: testData.instanceId,
        shortHash: 'va61',
        build: 'build-id-1'
      }
      var buildModel = {
        deepCopy: function (cb) {
          cb(deepCopyError)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.returns(Promise.resolve(testInstance))
        sinon.stub(Runnable.prototype, 'newBuild').returns(buildModel)
        sinon.spy(buildModel, 'deepCopy')
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newBuild.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(deepCopyError.message)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(Runnable.prototype.newBuild)
            sinon.assert.calledWith(Runnable.prototype.newBuild, testInstance.build)
            sinon.assert.calledOnce(buildModel.deepCopy)
            done()
          })
      })
    })

    describe('build build failed', function () {
      var buildError = new Error('Build error')
      var testInstance = {
        _id: testData.instanceId,
        shortHash: 'va61',
        build: 'build-id-1'
      }
      var buildModel = {
        deepCopy: function (cb) {
          cb(null, buildModel)
        },
        build: function (opts, cb) {
          cb(buildError)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.returns(Promise.resolve(testInstance))
        sinon.stub(Runnable.prototype, 'newBuild').returns(buildModel)
        sinon.spy(buildModel, 'deepCopy')
        sinon.spy(buildModel, 'build')
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newBuild.restore()
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(buildError.message)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledTwice(Runnable.prototype.newBuild)
            sinon.assert.calledWith(Runnable.prototype.newBuild, testInstance.build)
            sinon.assert.calledOnce(buildModel.deepCopy)
            sinon.assert.calledOnce(buildModel.build)
            sinon.assert.calledWith(buildModel.build, {
              message: 'Recovery build',
              noCache: true
            })
            done()
          })
      })
    })

    describe('instance updated failed', function () {
      var updateError = new Error('Update error')
      var testInstance = {
        _id: testData.instanceId,
        shortHash: 'va61',
        build: 'build-id-1'
      }
      var instanceModel = {
        update: function (opts, cb) {
          cb(updateError)
        }
      }
      var buildModel = {
        _id: 'new-build-id-1',
        deepCopy: function (cb) {
          cb(null, buildModel)
        },
        build: function (opts, cb) {
          cb(null, buildModel)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.returns(Promise.resolve(testInstance))
        sinon.stub(Runnable.prototype, 'newBuild').returns(buildModel)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        sinon.spy(instanceModel, 'update')
        sinon.spy(buildModel, 'deepCopy')
        sinon.spy(buildModel, 'build')
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newBuild.restore()
        Runnable.prototype.newInstance.restore()
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(updateError.message)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledTwice(Runnable.prototype.newBuild)
            sinon.assert.calledWith(Runnable.prototype.newBuild, testInstance.build)
            sinon.assert.calledOnce(buildModel.deepCopy)
            sinon.assert.calledOnce(buildModel.build)
            sinon.assert.calledWith(buildModel.build, {
              message: 'Recovery build',
              noCache: true
            })
            sinon.assert.calledOnce(instanceModel.update)
            sinon.assert.calledWith(instanceModel.update, { build: buildModel._id })
            done()
          })
      })
    })

    describe('should work if no errors', function () {
      var testInstance = {
        _id: testData.instanceId,
        shortHash: 'va61',
        build: 'build-id-1'
      }
      var instanceModel = {
        update: function (opts, cb) {
          cb(null, instanceModel)
        }
      }
      var buildModel = {
        _id: 'new-build-id-1',
        deepCopy: function (cb) {
          cb(null, buildModel)
        },
        build: function (opts, cb) {
          cb(null, buildModel)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.returns(Promise.resolve(testInstance))
        sinon.stub(Runnable.prototype, 'newBuild').returns(buildModel)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        sinon.spy(instanceModel, 'update')
        sinon.spy(buildModel, 'deepCopy')
        sinon.spy(buildModel, 'build')
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newInstance.restore()
        Runnable.prototype.newBuild.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledTwice(Runnable.prototype.newBuild)
            sinon.assert.calledWith(Runnable.prototype.newBuild, testInstance.build)
            sinon.assert.calledOnce(buildModel.deepCopy)
            sinon.assert.calledOnce(buildModel.build)
            sinon.assert.calledWith(buildModel.build, {
              message: 'Recovery build',
              noCache: true
            })
            sinon.assert.calledOnce(Runnable.prototype.newInstance)
            sinon.assert.calledWith(Runnable.prototype.newInstance, testInstance.shortHash)
            sinon.assert.calledOnce(instanceModel.update)
            sinon.assert.calledWith(instanceModel.update, { build: buildModel._id })
            done()
          })
      })
    })
  })
})
