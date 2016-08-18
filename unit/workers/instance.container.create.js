require('loadenv')()

var Boom = require('dat-middleware').Boom
var Code = require('code')
var Lab = require('lab')
var moment = require('moment')
var Promise = require('bluebird')
var sinon = require('sinon')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var errors = require('errors')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var PermissionService = require('models/services/permission-service')
var rabbitmq = require('models/rabbitmq')
var Worker = require('workers/instance.container.create')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('createInstanceContainer', function () {
  describe('finalRetryFn', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'setContainerCreateError').returns(Promise.resolve())
      done()
    })

    afterEach(function (done) {
      Instance.setContainerCreateError.restore()
      done()
    })

    it('should update instance with error', function (done) {
      var job = {
        contextVersionId: '123456789012345678901234',
        instanceId: '123456789012345678901234',
        ownerUsername: 'runnable',
        sessionUserGithubId: 'id'
      }
      Worker.finalRetryFn(job).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Instance.setContainerCreateError)
        sinon.assert.calledWith(Instance.setContainerCreateError,
          job.instanceId,
          job.contextVersionId,
          'failed to create container')
        done()
      })
    })
  }) // end finalRetryFn

  describe('task', function () {
    var ctx

    beforeEach(function (done) {
      ctx = {
        job: {
          contextVersionId: '123456789012345678901234',
          instanceId: '123456789012345678901234',
          ownerUsername: 'runnable',
          sessionUserGithubId: 'id'
        },
        contextVersion: {
          build: {
            completed: moment().subtract(3, 'minutes').format()
          }
        }
      }
      sinon.stub(ContextVersion, 'findById')
        .yieldsAsync(null, ctx.contextVersion)
      sinon.stub(InstanceService, 'createContainer')
        .returns(Promise.resolve())
      sinon.stub(PermissionService, 'checkOwnerAllowed')
        .returns(Promise.resolve())
      done()
    })

    afterEach(function (done) {
      ContextVersion.findById.restore()
      InstanceService.createContainer.restore()
      PermissionService.checkOwnerAllowed.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        InstanceService.createContainer.yieldsAsync()
        done()
      })

      it('should call InstanceService.createContainer', function (done) {
        Worker.task(ctx.job)
          .asCallback(function (err) {
            if (err) { return done(err) }
            sinon.assert.calledWith(InstanceService.createContainer, ctx.job)
            done()
          })
      })
    }) // end 'success'

    describe('error', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitmq, 'publishInstanceRebuild')
        sinon.stub(Instance, 'setContainerCreateError').returns(Promise.resolve())
        sinon.stub(error, 'log')
        done()
      })

      afterEach(function (done) {
        rabbitmq.publishInstanceRebuild.restore()
        Instance.setContainerCreateError.restore()
        error.log.restore()
        done()
      })

      describe('context version not found', function () {
        beforeEach(function (done) {
          ContextVersion.findById.onCall(0).yieldsAsync()
          done()
        })

        it('should fatally error', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              console.log(err)
              expect(err).to.exist()
              expect(err).to.be.an.instanceOf(WorkerStopError)
              done()
            })
        })
      }) // end context version not found

      describe('owner not allowed', function () {
        beforeEach(function (done) {
          PermissionService.checkOwnerAllowed.restore()
          sinon.stub(PermissionService, 'checkOwnerAllowed', function () {
            return Promise.reject(new errors.OrganizationNotAllowedError('not allowed'))
          })
          done()
        })

        it('should fatally error', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err).to.be.an.instanceOf(WorkerStopError)
              done()
            })
        })

        it('should update instance if fatal error', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              expect(err).to.exist()
              sinon.assert.calledOnce(Instance.setContainerCreateError)
              sinon.assert.calledWith(Instance.setContainerCreateError,
                ctx.job.instanceId,
                ctx.job.contextVersionId,
                err.message)
              done()
            })
        })
      }) // end 'owner not allowed'

      describe('unknown', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          InstanceService.createContainer.yieldsAsync(ctx.err)
          done()
        })

        it('should call InstanceService.createContainer', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              expect(err.cause).to.equal(ctx.err)
              done()
            })
        })
      }) // end 'unknown'

      describe('4XX', function () {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('boom')
          InstanceService.createContainer.yieldsAsync(ctx.err)
          done()
        })

        it('should call InstanceService.createContainer', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              expect(err.data.originalError.cause).to.equal(ctx.err)
              done()
            })
        })
      }) // end '4XX'

      describe('when the build completed time is beyond rebuild threshold', function () {
        beforeEach(function (done) {
          ctx.err = new Error('Unable to find dock with required resources')
          ctx.contextVersion = {
            build: {
              completed: moment().subtract(3, 'minutes').format()
            }
          }
          ContextVersion.findById.yieldsAsync(null, ctx.contextVersion)
          InstanceService.createContainer.yieldsAsync(ctx.err)
          done()
        })

        it('should not trigger a re-build', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              expect(err.cause).to.equal(ctx.err)
              sinon.assert.notCalled(rabbitmq.publishInstanceRebuild)
              sinon.assert.notCalled(error.log)
              done()
            })
        })
      }) // end 'when the build completed time is beyond rebuild threshold'

      describe('image not found error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('image 1234 not found')
          InstanceService.createContainer.yieldsAsync(ctx.err)
          done()
        })

        it('should trigger a re-build of the instance', function (done) {
          Worker.task(ctx.job)
            .asCallback(function (err) {
              if (err) { return done(err) }
              sinon.assert.calledOnce(ContextVersion.findById)
              sinon.assert.calledWith(
                ContextVersion.findById,
                ctx.job.contextVersionId
              )
              sinon.assert.calledOnce(rabbitmq.publishInstanceRebuild)
              sinon.assert.calledWith(rabbitmq.publishInstanceRebuild, {
                instanceId: ctx.job.instanceId
              })
              sinon.assert.calledOnce(error.log)
              // Can't do a direct calledWith here because bluebird wraps errors
              sinon.assert.calledWith(
                error.log,
                sinon.match.has(
                  'message',
                  sinon.match(/publishing.*instance.*two.*minutes/i))
              )
              done()
            })
        }) // end 'should trigger a re-build of the instance'

        describe('when the build completed less than 30 seconds ago', function () {
          beforeEach(function (done) {
            ctx.contextVersion.build.completed = moment().subtract(29, 'seconds')
            done()
          })

          it('should not trigger a re-build', function (done) {
            Worker.task(ctx.job)
              .asCallback(function (err) {
                expect(err.cause).to.equal(ctx.err)
                sinon.assert.calledOnce(ContextVersion.findById)
                sinon.assert.calledWith(
                  ContextVersion.findById,
                  ctx.job.contextVersionId
                )
                sinon.assert.notCalled(rabbitmq.publishInstanceRebuild)
                sinon.assert.notCalled(error.log)
                done()
              })
          })
        }) // end 'when the build completed less than 30 seconds ago'
      }) // end 'image not found error'
    }) // end 'error'
  }) // end task
}) // end 'createInstanceContainer'
