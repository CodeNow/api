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

var sinon = require('sinon')
var Worker = require('workers/instance.rebuild')
var TaskFatalError = require('ponos').TaskFatalError

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: instance.rebuild unit test: ' + moduleName, function () {
  var testInstanceId = '507f1f77bcf86cd799439011'
  var testInstanceShortHash = '2p8kye'
  var testData = {
    instanceId: testInstanceId,
    instanceShortHash: testInstanceShortHash
  }

  describe('worker', function () {
    beforeEach(function (done) {
      sinon.stub(Runnable.prototype, 'githubLogin')
      done()
    })

    afterEach(function (done) {
      Runnable.prototype.githubLogin.restore()
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
      it('should throw a task fatal error if the job is missing a instanceShortHash', function (done) {
        Worker({ instanceId: 'some-mongo-id' }).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceShortHash')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the instanceShortHash is not a string', function (done) {
        Worker({instanceId: 'some-mongo-id', instanceShortHash: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceShortHash')
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
            done()
          })
      })
    })

    describe('instance lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            done()
          })
      })
    })

    describe('instance was not found', function () {
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        var instanceModel = {
          fetch: function (cb) {
            cb(new Error('Fetch error'))
          }
        }
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Fetch error')
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            // sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('build deep copy failed', function () {
      var testInstance = {
        shortHash: 'va61'
      }
      var instanceModel = {
        build: {
          deepCopy: function (cb) {
            cb(new Error('Deep copy error'))
          }
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.yields(null, testInstance)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newInstance.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Deep copy error')
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('build build failed', function () {
      var testInstance = {
        shortHash: 'va61'
      }
      var buildModel = {
        build: function (opts, cb) {
          expect(opts.message).to.equal('Recovery build')
          expect(opts.noCache).to.be.true()
          cb(new Error('Build failed'))
        }
      }
      var instanceModel = {
        build: {
          deepCopy: function (cb) {
            cb(null, buildModel)
          }
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.yields(null, testInstance)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newInstance.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Build failed')
            sinon.assert.calledOnce(Runnable.prototype.newInstance)
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('instance updated failed', function () {
      var testInstance = {
        shortHash: 'va61'
      }
      var buildModel = {
        _id: '507f191e810c19729de860ea',
        build: function (opts, cb) {
          expect(opts.message).to.equal('Recovery build')
          expect(opts.noCache).to.be.true()
          cb(null)
        }
      }
      var instanceModel = {
        build: {
          deepCopy: function (cb) {
            cb(null, buildModel)
          }
        },
        update: function (opts, cb) {
          expect(opts.build).to.equal(buildModel._id)
          cb(new Error('Update failed'))
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.yields(null, testInstance)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newInstance.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Update failed')
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledOnce(Runnable.prototype.newInstance)
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('should work if no errors', function () {
      var testInstance = {
        shortHash: 'va61'
      }
      var buildModel = {
        _id: '507f191e810c19729de860ea',
        build: function (opts, cb) {
          expect(opts.message).to.equal('Recovery build')
          expect(opts.noCache).to.be.true()
          cb(null)
        }
      }
      var instanceModel = {
        build: {
          deepCopy: function (cb) {
            cb(null, buildModel)
          }
        },
        update: function (opts, cb) {
          expect(opts.build).to.equal(buildModel._id)
          cb(null)
        }
      }
      beforeEach(function (done) {
        Runnable.prototype.githubLogin.yields(null)
        Instance.findById.yields(null, testInstance)
        sinon.stub(Runnable.prototype, 'newInstance').returns(instanceModel)
        done()
      })

      afterEach(function (done) {
        Runnable.prototype.newInstance.restore()
        done()
      })
      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Runnable.prototype.githubLogin)
            sinon.assert.calledOnce(Runnable.prototype.newInstance)
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })
  })
})
