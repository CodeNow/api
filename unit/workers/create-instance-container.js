require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var Boom = require('dat-middleware').Boom
var moment = require('moment')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var ContextVersionService = require('models/services/context-version-service')
var createInstanceContainer = require('workers/create-instance-container')
var error = require('error')
var InstanceService = require('models/services/instance-service')
var rabbitmq = require('models/rabbitmq')

describe('createInstanceContainer', function () {
  var ctx

  beforeEach(function (done) {
    ctx = {
      job: {
        contextVersionId: '123456789012345678901234',
        instanceId: '123456789012345678901234',
        ownerUsername: 'runnable'
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
    sinon.stub(ContextVersionService, 'checkOwnerAllowed')
      .returns(Promise.resolve())
    done()
  })

  afterEach(function (done) {
    ContextVersion.findById.restore()
    InstanceService.createContainer.restore()
    ContextVersionService.checkOwnerAllowed.restore()
    done()
  })

  describe('success', function () {
    beforeEach(function (done) {
      InstanceService.createContainer.yieldsAsync()
      done()
    })

    it('should call InstanceService.createContainer', function (done) {
      createInstanceContainer(ctx.job)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledWith(InstanceService.createContainer, ctx.job)
          done()
        })
    })
  }) // end 'success'

  describe('error', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitmq, 'publishInstanceRebuild')
      sinon.stub(error, 'log')
      done()
    })

    afterEach(function (done) {
      rabbitmq.publishInstanceRebuild.restore()
      error.log.restore()
      done()
    })

    describe('owner not allowed', function () {
      beforeEach(function (done) {
        ContextVersionService.checkOwnerAllowed.restore()
        sinon.stub(ContextVersionService, 'checkOwnerAllowed', function () {
          return Promise.reject(new Error('not allowed'))
        })
        done()
      })

      it('should fatally error', function (done) {
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.an.instanceof(TaskFatalError)
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
        createInstanceContainer(ctx.job)
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
        createInstanceContainer(ctx.job)
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
        createInstanceContainer(ctx.job)
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
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err).to.not.exist()
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
          createInstanceContainer(ctx.job)
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
}) // end 'createInstanceContainer'
