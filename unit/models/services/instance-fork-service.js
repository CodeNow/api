/**
 * @module unit/models/services/instance-fork-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var clone = require('101/clone')
var omit = require('101/omit')
var sinon = require('sinon')

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var InstanceForkService = require('models/services/instance-fork-service')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceForkService: ' + moduleName, function () {
  describe('#autoFork Instances', function () {
    var instances
    var pushInfo = {}

    beforeEach(function (done) {
      instances = []
      sinon.stub(InstanceForkService, '_autoFork').returns({})
      done()
    })

    afterEach(function (done) {
      InstanceForkService._autoFork.restore()
      done()
    })

    describe('errors', function () {
      it('should make sure instances is an array', function (done) {
        InstanceForkService.autoFork().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instances.+array/i)
          sinon.assert.notCalled(InstanceForkService._autoFork)
          done()
        })
      })

      it('should require pushInfo to exist', function (done) {
        InstanceForkService.autoFork(instances).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/autoFork.+requires.+pushInfo/i)
          sinon.assert.notCalled(InstanceForkService._autoFork)
          done()
        })
      })
    })

    it('should not fork anything with an empty array', function (done) {
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(InstanceForkService._autoFork)
        done()
      })
    })

    it('should fork all given instances', function (done) {
      var i = {}
      instances.push(i)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService._autoFork)
        sinon.assert.calledWithExactly(
          InstanceForkService._autoFork,
          i,
          pushInfo
        )
        done()
      })
    })

    it('should collect all results in an array and return them', function (done) {
      var one = {}
      var two = {}
      instances.push(one, two)
      InstanceForkService._autoFork.onFirstCall().returns(1)
      InstanceForkService._autoFork.onSecondCall().returns(2)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err, results) {
        expect(err).to.not.exist()
        sinon.assert.calledTwice(InstanceForkService._autoFork)
        sinon.assert.calledWithExactly(
          InstanceForkService._autoFork,
          one,
          pushInfo
        )
        sinon.assert.calledWithExactly(
          InstanceForkService._autoFork,
          two,
          pushInfo
        )
        expect(results).to.deep.equal([ 1, 2 ])
        done()
      })
    })
  })

  describe('#_autoFork Instance', function () {
    var contextVersion
    var instance
    var pushInfo
    var mockContext
    var mockContextVersion

    beforeEach(function (done) {
      contextVersion = {
        context: 'mockContextId'
      }
      instance = {
        contextVersion: contextVersion
      }
      pushInfo = {
        repo: 'mockRepo',
        branch: 'mockBranch',
        commit: 'mockCommit',
        user: {
          id: 7
        }
      }
      mockContext = {
        owner: {
          github: 14
        }
      }
      mockContextVersion = {
        _id: 21
      }
      sinon.stub(Context, 'findOne').yieldsAsync(null, mockContext)
      sinon.stub(ContextService, 'handleVersionDeepCopy').yieldsAsync(null, mockContextVersion)
      sinon.stub(ContextVersion, 'modifyAppCodeVersionByRepo').yieldsAsync(null, mockContextVersion)
      done()
    })

    afterEach(function (done) {
      Context.findOne.restore()
      ContextService.handleVersionDeepCopy.restore()
      ContextVersion.modifyAppCodeVersionByRepo.restore()
      done()
    })

    describe('validation errors', function () {
      it('should require an instance', function (done) {
        InstanceForkService._autoFork().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+instance/)
          done()
        })
      })

      it('should require an instance.contextVersion', function (done) {
        delete instance.contextVersion
        InstanceForkService._autoFork(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+instance\.contextVersion/)
          done()
        })
      })

      it('should require an instance.contextVersion.context', function (done) {
        delete contextVersion.context
        InstanceForkService._autoFork(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+instance\.contextVersion\.context/)
          done()
        })
      })

      it('should require the pushInfo', function (done) {
        InstanceForkService._autoFork(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+pushInfo/)
          done()
        })
      })

      it('should require pushInfo.repo', function (done) {
        var info = omit(pushInfo, 'repo')
        InstanceForkService._autoFork(instance, info).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+requires.+repo/)
          done()
        })
      })

      it('should require pushInfo.branch', function (done) {
        var info = omit(pushInfo, 'branch')
        InstanceForkService._autoFork(instance, info).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+requires.+branch/)
          done()
        })
      })

      it('should require pushInfo.commit', function (done) {
        var info = omit(pushInfo, 'commit')
        InstanceForkService._autoFork(instance, info).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+requires.+commit/)
          done()
        })
      })

      it('should require pushInfo.user.id', function (done) {
        var info = clone(pushInfo)
        delete info.user.id
        InstanceForkService._autoFork(instance, info).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+requires.+pushInfo.+user/)
          done()
        })
      })

      it('should require the found context to have an owner.github', function (done) {
        delete mockContext.owner.github
        InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_autoFork.+context.+owner/)
          done()
        })
      })
    })

    describe('behavior errors', function () {
      var error
      describe('in Context.findOne', function () {
        beforeEach(function (done) {
          error = new Error('doobie')
          Context.findOne.yieldsAsync(error)
          done()
        })

        it('should return errors', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.notCalled(ContextService.handleVersionDeepCopy)
            sinon.assert.notCalled(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })

      describe('in ContextService.handleVersionDeepCopy', function () {
        beforeEach(function (done) {
          error = new Error('robot')
          ContextService.handleVersionDeepCopy.yieldsAsync(error)
          done()
        })

        it('should return errors', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
            sinon.assert.notCalled(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })

      describe('in ContextService.handleVersionDeepCopy', function () {
        beforeEach(function (done) {
          error = new Error('luna')
          ContextVersion.modifyAppCodeVersionByRepo.yieldsAsync(error)
          done()
        })

        it('should return ContextVersion.modifyAppCodeVersionByRepo errors', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should have called everything', function (done) {
          InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
            sinon.assert.calledOnce(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })
    })

    it('should create a new context version', function (done) {
      InstanceForkService._autoFork(instance, pushInfo).asCallback(function (err, contextVersion) {
        expect(err).to.not.exist()
        expect(contextVersion).to.deep.equal(mockContextVersion)
        sinon.assert.calledOnce(Context.findOne)
        sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
        sinon.assert.calledOnce(ContextVersion.modifyAppCodeVersionByRepo)
        done()
      })
    })

    // it('should create and build a new build', function (done) { done(new Error('wip')) })

    // it('should return the new context versions', function (done) { done(new Error('wip')) })
  })
})
