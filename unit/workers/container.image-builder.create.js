/**
 * @module unit/workers/container.image-builder.create
 */
'use strict'
var Code = require('code')
var Lab = require('lab')
var noop = require('101/noop')
var Promise = require('bluebird')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var BuildService = require('models/services/build-service')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var errors = require('errors')
var PermissionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var Worker = require('workers/container.image-builder.create')

require('sinon-as-promised')(Promise)
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('ContainerImageBuilderCreate unit test', function () {
  describe('finalRetryFn', function () {
    beforeEach(function (done) {
      sinon.stub(BuildService, 'handleBuildComplete')
      done()
    })

    afterEach(function (done) {
      BuildService.handleBuildComplete.restore()
      done()
    })

    it('should call build complete', function (done) {
      var testId = '123123123'
      BuildService.handleBuildComplete.resolves()
      Worker.finalRetryFn({
        contextVersionBuildId: testId
      }).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(BuildService.handleBuildComplete)
        sinon.assert.calledWith(BuildService.handleBuildComplete, testId, {
          failed: true,
          error: {
            message: 'Failed to create build container, max retries reached'
          }
        })
        done()
      })
    })
  }) // end finalRetryFn

  describe('task', function () {
    var validJob = {
      contextId: 'context-id',
      contextVersionId: 'context-version-id',
      contextVersionBuildId: 'context-version-build-id',
      sessionUserGithubId: 'session-user-github-id',
      ownerUsername: 'owner-username',
      manualBuild: true,
      noCache: false,
      tid: 'job-tid'
    }
    var mockUser = { _id: 'user-id' }
    var mockContextVersion = {
      _id: 'context-version-id',
      build: {
        _id: 'some-build-id'
      },
      populateAsync: noop
    }
    var mockContainer = {
      id: 'container-id'
    }
    var mockDockerTag = 'docker-tag'

    beforeEach(function (done) {
      sinon.stub(User, 'findByGithubIdAsync').resolves(mockUser)
      sinon.stub(ContextVersion, 'findOneCreating').resolves(mockContextVersion)
      sinon.stub(ContextVersion, 'recoverAsync').resolves()
      sinon.stub(mockContextVersion, 'populateAsync').resolves()
      sinon.stub(Docker.prototype, 'createImageBuilderAsync').resolves(mockContainer)
      sinon.stub(Docker, 'getDockerTag').returns(mockDockerTag)
      sinon.stub(PermissionService, 'checkOwnerAllowed').resolves()
      sinon.stub(BuildService, 'handleBuildComplete')
      done()
    })

    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      ContextVersion.findOneCreating.restore()
      ContextVersion.recoverAsync.restore()
      mockContextVersion.populateAsync.restore()
      Docker.prototype.createImageBuilderAsync.restore()
      Docker.getDockerTag.restore()
      PermissionService.checkOwnerAllowed.restore()
      BuildService.handleBuildComplete.restore()
      done()
    })

    describe('checkAllowed', function () {
      it('should fatally reject if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('not allowed'))
        BuildService.handleBuildComplete.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          done()
        })
      })

      it('should fatally reject if org is not found', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotFoundError('not allowed'))
        BuildService.handleBuildComplete.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          done()
        })
      })
    }) // end 'checkAllowed'

    describe('WorkerStopError', function () {
      it('should handleBuildComplete', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('not allowed'))
        BuildService.handleBuildComplete.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          sinon.assert.calledOnce(BuildService.handleBuildComplete)
          sinon.assert.calledWith(BuildService.handleBuildComplete, validJob.contextVersionBuildId, {
            failed: true,
            error: {
              message: err.message
            }
          })
          done()
        })
      })
    }) // end 'checkAllowed'

    describe('fetchRequiredModels', function () {
      describe('on success', function () {
        beforeEach(function (done) {
          Worker.task(validJob).asCallback(done)
        })

        it('should fetch the user by github id', function (done) {
          sinon.assert.calledOnce(User.findByGithubIdAsync)
          sinon.assert.calledWith(
            User.findByGithubIdAsync,
            validJob.sessionUserGithubId
          )
          done()
        })

        it('should use the correct query', function (done) {
          sinon.assert.calledOnce(ContextVersion.findOneCreating)
          sinon.assert.calledWith(ContextVersion.findOneCreating, validJob.contextVersionId)
          done()
        })
      }) // end 'on success'

      describe('on user not found', function () {
        var rejectError

        beforeEach(function (done) {
          BuildService.handleBuildComplete.resolves()
          User.findByGithubIdAsync.resolves(null)
          Worker.task(validJob).asCallback(function (err) {
            rejectError = err
            done()
          })
        })

        it('should fatally reject', function (done) {
          expect(rejectError).to.exist()
          expect(rejectError).to.be.an.instanceof(WorkerStopError)
          done()
        })

        it('should set the correct error message', function (done) {
          expect(rejectError.message).to.match(/User not found/)
          done()
        })
      }) // end 'on user not found'

      describe('on context version not found', function () {
        var rejectError

        beforeEach(function (done) {
          BuildService.handleBuildComplete.resolves()
          ContextVersion.findOneCreating.rejects(new ContextVersion.NotFoundError({
            q: 'this'
          }))
          Worker.task(validJob).asCallback(function (err) {
            rejectError = err
            done()
          })
        })

        it('should WorkerStopError', function (done) {
          expect(rejectError).to.exist()
          expect(rejectError).to.be.an.instanceof(WorkerStopError)
          done()
        })

        it('should set the correct error message', function (done) {
          expect(rejectError.message).to.match(/ContextVersion not found/)
          done()
        })

        it('should call handleBuildComplete', function (done) {
          sinon.assert.calledOnce(BuildService.handleBuildComplete)
          sinon.assert.calledWith(BuildService.handleBuildComplete, validJob.contextVersionBuildId, {
            failed: true,
            error: {
              message: rejectError.message
            }
          })
          done()
        })
      }) // end 'on context version not found'

      describe('on context version IncorrectStateError', function () {
        var rejectError

        beforeEach(function (done) {
          BuildService.handleBuildComplete.resolves()
          ContextVersion.findOneCreating.rejects(new ContextVersion.IncorrectStateError('funning', {}))
          Worker.task(validJob).asCallback(function (err) {
            rejectError = err
            done()
          })
        })

        it('should WorkerStopError', function (done) {
          expect(rejectError).to.exist()
          expect(rejectError).to.be.an.instanceof(WorkerStopError)
          done()
        })

        it('should set the correct error message', function (done) {
          expect(rejectError.message).to.match(/ContextVersion not in correct state/)
          done()
        })

        it('should not call handleBuildComplete', function (done) {
          sinon.assert.notCalled(BuildService.handleBuildComplete)
          done()
        })
      }) // end 'on context version not found'
    }) // end 'fetchRequiredModels'

    describe('initiateBuild', function () {
      beforeEach(function (done) {
        Worker.task(validJob).asCallback(done)
      })

      it('should populate the infra-code version', function (done) {
        sinon.assert.calledOnce(mockContextVersion.populateAsync)
        sinon.assert.calledWith(
          mockContextVersion.populateAsync,
          'infraCodeVersion'
        )
        done()
      })

      describe('createImageBuilderContainer', function () {
        var createOpts

        beforeEach(function (done) {
          createOpts = Docker.prototype.createImageBuilderAsync.firstCall.args[0]
          done()
        })

        it('should create the image builder container', function (done) {
          sinon.assert.calledOnce(Docker.prototype.createImageBuilderAsync)
          done()
        })

        it('should correctly indicate a manual build', function (done) {
          expect(createOpts.manualBuild).to.equal(validJob.manualBuild)
          done()
        })

        it('should pass the fetched session user', function (done) {
          expect(createOpts.sessionUser).to.deep.equal(mockUser)
          done()
        })

        it('should pass the correct owner username', function (done) {
          expect(createOpts.ownerUsername).to.equal(validJob.ownerUsername)
          done()
        })

        it('should pass the fetched context version', function (done) {
          expect(createOpts.contextVersion).to.deep.equal(mockContextVersion)
          done()
        })

        it('should correctly set caching', function (done) {
          expect(createOpts.noCache).to.equal(validJob.noCache)
          done()
        })
      }) // end 'createImageBuilderContainer'

      describe('markContextVersionAsRecovered', function () {
        it('should mark the context version as recovered', function (done) {
          sinon.assert.calledOnce(ContextVersion.recoverAsync)
          sinon.assert.calledWith(
            ContextVersion.recoverAsync,
            mockContextVersion._id
          )
          done()
        })
      }) // end 'markContextVersionAsRecovered'
    }) // end 'initiateBuild'
  }) // end 'task'
}) // end 'ContainerImageBuilderCreate unit test'
