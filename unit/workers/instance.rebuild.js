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
var Runnable = require('runnable')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

var sinon = require('sinon')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)
var Worker = require('workers/instance.rebuild')
var TaskFatalError = require('ponos').TaskFatalError

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: instance.rebuild unit test: ' + moduleName, function () {
  var testInstanceId = '507f1f77bcf86cd799439011'
  var testData = {
    instanceId: testInstanceId
  }
  var testUser = {
    accounts: {
      github: {
        accessToken: 345
      }
    }
  }
  var testInstance = {
    createdBy: {
      github: 678
    }
  }

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Runnable.prototype, 'githubLogin')
      sinon.stub(Instance, 'findById').yields(null, testInstance)
      sinon.stub(User, 'findByGithubIdAsync').resolves(testUser)
      done()
    })

    afterEach(function (done) {
      Runnable.prototype.githubLogin.restore()
      Instance.findById.restore()
      User.findByGithubIdAsync.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing a instanceId', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.data.validationError).to.exist()
          expect(err.data.validationError.message)
            .to.match(/instanceId.*required/i)
          done()
        })
      })
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.data.validationError).to.exist()
          expect(err.data.validationError.message)
            .to.match(/instanceId.*string/i)
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.data.validationError).to.exist()
          expect(err.data.validationError.message)
            .to.match(/job.+required/)
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.data.validationError).to.exist()
          expect(err.data.validationError.message)
            .to.contain('must be an object')
          done()
        })
      })
    })

    describe('instance lookup fails', function () {
      var fetchError = new Error('Fetch error')
      beforeEach(function (done) {
        Instance.findById.yields(fetchError)
        done()
      })
      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(fetchError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            done()
          })
      })
    })

    describe('instance not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, null)
        done()
      })
      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.match(/instance not found/gi)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            done()
          })
      })
    })

    describe('user login', function () {
      describe('user not found', function () {
        var mongoErr = new Error('Mongo error')
        beforeEach(function (done) {
          User.findByGithubIdAsync.rejects(mongoErr)
          done()
        })

        it('should callback with error', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err.message).to.equal(mongoErr.message)
              sinon.assert.calledOnce(Instance.findById)
              sinon.assert.calledWith(Instance.findById, testData.instanceId)
              sinon.assert.calledOnce(User.findByGithubIdAsync)
              sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
              sinon.assert.notCalled(Runnable.prototype.githubLogin)
              done()
            })
        })
      })

      describe('user not found', function () {
        beforeEach(function (done) {
          User.findByGithubIdAsync.resolves(null)
          done()
        })

        it('should callback with error', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err.message).to.match(/creator.*runnable.*user/gi)
              sinon.assert.calledOnce(Instance.findById)
              sinon.assert.calledWith(Instance.findById, testData.instanceId)
              sinon.assert.calledOnce(User.findByGithubIdAsync)
              sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
              sinon.assert.notCalled(Runnable.prototype.githubLogin)
              done()
            })
        })
      })

      describe('user has no access token', function () {
        beforeEach(function (done) {
          User.findByGithubIdAsync.resolves({})
          done()
        })

        it('should callback with error', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err.message).to.match(/creator.*runnable.*user/gi)
              sinon.assert.calledOnce(Instance.findById)
              sinon.assert.calledWith(Instance.findById, testData.instanceId)
              sinon.assert.calledOnce(User.findByGithubIdAsync)
              sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
              sinon.assert.notCalled(Runnable.prototype.githubLogin)
              done()
            })
        })
      })

      describe('login failure', function () {
        var loginError = new Error('Login failed')
        beforeEach(function (done) {
          Runnable.prototype.githubLogin.yields(loginError)
          done()
        })

        it('should callback with error', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err.message).to.equal(loginError.message)
              sinon.assert.calledOnce(Instance.findById)
              sinon.assert.calledWith(Instance.findById, testData.instanceId)
              sinon.assert.calledOnce(User.findByGithubIdAsync)
              sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
              sinon.assert.calledOnce(Runnable.prototype.githubLogin)
              sinon.assert.calledWith(Runnable.prototype.githubLogin, testUser.accounts.github.accessToken)
              done()
            })
        })
      })
    })

    describe('build deep copy failed', function () {
      var deepCopyError = new Error('Deep copy error')
      var testInstance = {
        _id: testData.instanceId,
        shortHash: 'va61',
        build: 'build-id-1',
        createdBy: {
          github: 123
        }
      }
      var buildModel = {
        deepCopy: function (cb) {
          cb(deepCopyError)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.yields(null, testInstance)
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
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(User.findByGithubIdAsync)
            sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, testUser.accounts.github.accessToken)
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
        build: 'build-id-1',
        createdBy: {
          github: 456
        }
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
        Instance.findById.yields(null, testInstance)
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
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(User.findByGithubIdAsync)
            sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, testUser.accounts.github.accessToken)
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
        build: 'build-id-1',
        createdBy: {
          github: 456
        }
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
        Instance.findById.yields(null, testInstance)
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
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(User.findByGithubIdAsync)
            sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, testUser.accounts.github.accessToken)
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
        build: 'build-id-1',
        createdBy: {
          github: 456
        }
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
        Instance.findById.yields(null, testInstance)
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
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledWith(Runnable.prototype.githubLogin, testUser.accounts.github.accessToken)
            sinon.assert.calledOnce(User.findByGithubIdAsync)
            sinon.assert.calledOnce(User.findByGithubIdAsync, testInstance.createdBy.github)
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
