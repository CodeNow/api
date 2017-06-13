/**
 * @module unit/workers/build.container.create
 */
'use strict'
const Code = require('code')
const Lab = require('lab')
const noop = require('101/noop')
const Promise = require('bluebird')
const sinon = require('sinon')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const sshKeyService = require('models/services/ssh-key-service')

const BuildService = require('models/services/build-service')
const ContextVersion = require('models/mongo/context-version')
const Docker = require('models/apis/docker')
const errors = require('errors')
const OrganizationService = require('models/services/organization-service')
const PermissionService = require('models/services/permission-service')
const User = require('models/mongo/user')
const Worker = require('workers/build.container.create')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('ContainerImageBuilderCreate unit test', function () {
  describe('finalRetryFn', function () {
    beforeEach(function (done) {
      sinon.stub(BuildService, 'updateFailedBuild')
      done()
    })

    afterEach(function (done) {
      BuildService.updateFailedBuild.restore()
      done()
    })

    it('should call build complete', function (done) {
      var testId = '123123123'
      BuildService.updateFailedBuild.resolves()
      Worker.finalRetryFn({
        contextVersionBuildId: testId
      }).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(BuildService.updateFailedBuild)
        sinon.assert.calledWith(BuildService.updateFailedBuild, testId,
          'Failed to create build container, max retries reached'
        )
        done()
      })
    })
  }) // end finalRetryFn

  describe('task', function () {
    const validJob = {
      contextId: 'context-id',
      contextVersionId: 'context-version-id',
      contextVersionBuildId: 'context-version-build-id',
      sessionUserGithubId: 'session-user-github-id',
      ownerUsername: 'owner-username',
      manualBuild: true,
      noCache: false,
      tid: 'job-tid'
    }
    const mockUser = {
      _id: 'user-id',
      accounts: {
        github: {
          accessToken: 'token'
        }
      }
    }
    const mockContextVersion = {
      _id: 'context-version-id',
      build: {
        _id: 'some-build-id'
      },
      populateAsync: noop
    }
    const mockContainer = {
      id: 'container-id'
    }
    const mockDockerTag = 'docker-tag'
    const organization = {
      id: 111,
      githubId: 8888,
      privateRegistryUrl: 'dockerhub.com',
      privateRegistryUsername: 'runnabot'
    }
    beforeEach(function (done) {
      sinon.stub(User, 'findByGithubIdAsync').resolves(mockUser)
      sinon.stub(ContextVersion, 'findOneCreating').resolves(mockContextVersion)
      sinon.stub(ContextVersion, 'recoverAsync').resolves()
      sinon.stub(mockContextVersion, 'populateAsync').resolves()
      sinon.stub(Docker.prototype, 'createImageBuilderAsync').resolves(mockContainer)
      sinon.stub(Docker, 'getDockerTag').returns(mockDockerTag)
      sinon.stub(PermissionService, 'checkOwnerAllowed').resolves()
      sinon.stub(OrganizationService, 'getByGithubUsername').resolves(organization)
      sinon.stub(BuildService, 'updateFailedBuild')
      sinon.stub(sshKeyService, 'getSshKeysByOrg').resolves(organization)
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
      OrganizationService.getByGithubUsername.restore()
      BuildService.updateFailedBuild.restore()
      sshKeyService.getSshKeysByOrg.restore()
      done()
    })

    describe('checkAllowed', function () {
      it('should fatally reject if owner is not allowed', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('not allowed'))
        BuildService.updateFailedBuild.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          done()
        })
      })

      it('should fatally reject if org is not found', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotFoundError('not allowed'))
        BuildService.updateFailedBuild.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          done()
        })
      })
    }) // end 'checkAllowed'

    describe('WorkerStopError', function () {
      it('should updateFailedBuild', function (done) {
        PermissionService.checkOwnerAllowed.rejects(new errors.OrganizationNotAllowedError('not allowed'))
        BuildService.updateFailedBuild.resolves()
        Worker.task(validJob).asCallback(function (err) {
          expect(err).to.be.an.instanceOf(WorkerStopError)
          sinon.assert.calledOnce(BuildService.updateFailedBuild)
          sinon.assert.calledWith(BuildService.updateFailedBuild, validJob.contextVersionBuildId, err.message)
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
          BuildService.updateFailedBuild.resolves()
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
          BuildService.updateFailedBuild.resolves()
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

        it('should call updateFailedBuild', function (done) {
          sinon.assert.calledOnce(BuildService.updateFailedBuild)
          sinon.assert.calledWith(BuildService.updateFailedBuild, validJob.contextVersionBuildId, rejectError.message)
          done()
        })
      }) // end 'on context version not found'

      describe('on context version IncorrectStateError', function () {
        var rejectError

        beforeEach(function (done) {
          BuildService.updateFailedBuild.resolves()
          ContextVersion.findOneCreating.rejects(new ContextVersion.IncorrectStateError('funning', {
            state: 'not funning'
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
          expect(rejectError.message).to.match(/ContextVersion.*funning.*not funning/)
          done()
        })

        it('should not call updateFailedBuild', function (done) {
          sinon.assert.notCalled(BuildService.updateFailedBuild)
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
          expect(createOpts.sessionUser).to.equal(mockUser)
          done()
        })

        it('should pass the correct oragnization', function (done) {
          expect(createOpts.organization.id).to.equal(organization.id)
          expect(createOpts.organization.githubUsername).to.equal(validJob.ownerUsername)
          expect(createOpts.organization.githubId).to.equal(organization.githubId)
          expect(createOpts.organization.privateRegistryUrl).to.equal(organization.privateRegistryUrl)
          expect(createOpts.organization.privateRegistryUsername).to.equal(organization.privateRegistryUsername)
          done()
        })

        it('should pass the fetched context version', function (done) {
          expect(createOpts.contextVersion).to.equal(mockContextVersion)
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
