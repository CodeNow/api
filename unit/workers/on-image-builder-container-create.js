/**
 * @module unit/workers/start-image-builder-container
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var keypather = require('keypather')()
var sinon = require('sinon')

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var messenger = require('socket/messenger')

var OnImageBuilderContainerCreateWorker = require('workers/on-image-builder-container-create')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnImageBuilderContainerCreate: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}

    ctx.mockContextVersion = {
      '_id': '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      },
      build: {
        _id: '23412312h3nk1lj2h3l1k2'
      }
    }
    ctx.data = require('../fixtures/docker-listener/build-image-container')
    ctx.labels = keypather.get(ctx.data, 'inspectData.Config.Labels')
    done()
  })

  describe('Full run', function () {
    describe('success', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new OnCreateImageBuilderContainer(ctx.data)
        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion)
        sinon.stub(messenger, 'emitContextVersionUpdate')
        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync()
        sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1)
        sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(null)
        done()
      })
      afterEach(function (done) {
        ContextVersion.findOne.restore()
        ContextVersion.updateBuildErrorByBuildId.restore()
        ContextVersion.updateBy.restore()
        Docker.prototype.startImageBuilderContainer.restore()
        messenger.emitContextVersionUpdate.restore()
        done()
      })
      it('should finish by updating the contextVersion', function (done) {
        ctx.worker().then(function () {
          // 2 because of the updateFrontend also making a call
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(2)
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          })

          expect(ContextVersion.findOne.args[1][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id
          })
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function()

          expect(ContextVersion.updateBy.callCount).to.equal(1)
          expect(ContextVersion.updateBy.args[0][0]).to.equal('build._id')
          expect(ContextVersion.updateBy.args[0][1])
            .to.deep.equal(ctx.mockContextVersion.build._id)
          expect(ContextVersion.updateBy.args[0][2]).to.be.object()
          expect(ContextVersion.updateBy.args[0][2].$set).to.be.object()
          expect(ContextVersion.updateBy.args[0][2].$set['build.containerStarted']).to.be.date()
          expect(ContextVersion.updateBy.args[0][3]).to.be.object()
          expect(ContextVersion.updateBy.args[0][3]).to.deep.equal({ multi: true })
          expect(ContextVersion.updateBy.args[0][4]).to.be.a.function()

          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to.equal(1)
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage')
            .to.deep.equal(ctx.data.inspectData.Id)
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
        .catch(done)
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        // initialize instance w/ props, don't actually run protected methods
        ctx.worker = new OnCreateImageBuilderContainer(ctx.data)

        sinon.stub(ContextVersion, 'findOne').yieldsAsync(null, ctx.mockContextVersion)

        sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync()
        sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1)
        sinon.stub(
          Docker.prototype,
          'startImageBuilderContainer'
        ).yieldsAsync(new Error('asdasdasd'))
        done()
      })
      afterEach(function (done) {
        ContextVersion.findOne.restore()
        Docker.prototype.startImageBuilderContainer.restore()
        ContextVersion.updateBuildErrorByBuildId.restore()
        ContextVersion.updateBy.restore()
        done()
      })
      it('should error', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(ContextVersion.findOne.callCount, 'findOne').to.equal(1)
          expect(ContextVersion.findOne.args[0][0], 'findOne').to.deep.equal({
            '_id': ctx.mockContextVersion._id,
            'build.containerStarted': {
              $exists: false
            },
            'build.started': {
              $exists: true
            },
            'build.finished': {
              $exists: false
            }
          })
          expect(ContextVersion.findOne.args[0][1], 'findOne').to.be.a.function()

          expect(Docker.prototype.startImageBuilderContainer.callCount, 'startImage').to
            .equal(1)
          expect(Docker.prototype.startImageBuilderContainer.args[0][0], 'startImage').to.deep
            .equal(ctx.data.inspectData.Id)
          expect(ContextVersion.updateBuildErrorByBuildId.callCount, 'updateBuildError')
            .to.equal(1)
          expect(ContextVersion.updateBuildErrorByBuildId.args[0][0], 'updateBuildError')
            .to.equal(ctx.mockContextVersion.build._id)

          done()
        })
      })
    })
  })

  describe('independent tests', function () {
    beforeEach(function (done) {
      // initialize instance w/ props, don't actually run protected methods
      ctx.worker = new OnCreateImageBuilderContainer(ctx.data)

      sinon.stub(async, 'series', function () {
        async.series.restore()
        done()
      })
      ctx.worker.handle(function () {})
    })

    describe('_startContainer', function () {
      beforeEach(function (done) {
        // normally set by _baseWorkerFindContextVersion
        ctx.worker.contextVersion = ctx.mockContextVersion
        done()
      })

      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(null)
          done()
        })
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore()
          done()
        })
        it('should callback successfully if container start', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err).to.be.null()
            expect(Docker.prototype.startImageBuilderContainer.callCount).to.equal(1)
            expect(Docker.prototype.startImageBuilderContainer.args[0][0])
              .to.deep.equal(ctx.data.inspectData.Id)
            done()
          })
        })
      })
      describe('failure n times', function () {
        beforeEach(function (done) {
          sinon.stub(Docker.prototype, 'startImageBuilderContainer')
            .yieldsAsync(new Error('docker error'))
          done()
        })
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore()
          done()
        })
        it('should attempt to start container n times', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err.message).to.equal('docker error')
            expect(Docker.prototype.startImageBuilderContainer.callCount)
              .to.equal(1)
            done()
          })
        })
      })
      describe('Already Started Failure', function () {
        beforeEach(function (done) {
          var error = new Error('docker error')
          error.statusCode = 304
          sinon.stub(Docker.prototype, 'startImageBuilderContainer').yieldsAsync(error)
          done()
        })
        afterEach(function (done) {
          Docker.prototype.startImageBuilderContainer.restore()
          done()
        })
        it('should attempt to start container 1 time, then contiue', function (done) {
          ctx.worker._startContainer(function (err) {
            expect(err).to.be.null()
            expect(Docker.prototype.startImageBuilderContainer.callCount).to.equal(1)
            done()
          })
        })
      })
    })

    describe('_updateContextVersion', function () {
      describe('basic', function () {
        beforeEach(function (done) {
          // normally set by _baseWorkerFindContextVersion
          ctx.worker.contextVersion = ctx.mockContextVersion
          done()
        })
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateBy').yieldsAsync(null, 1)
          done()
        })
        afterEach(function (done) {
          ContextVersion.updateBy.restore()
          done()
        })
        it('should query mongo for contextVersion', function (done) {
          ctx.worker._updateContextVersion(function (err) {
            expect(err).to.be.undefined()
            expect(ContextVersion.updateBy.callCount).to.equal(1)
            expect(ContextVersion.updateBy.args[0][0]).to.equal('build._id')
            expect(ContextVersion.updateBy.args[0][1])
              .to.deep.equal(ctx.mockContextVersion.build._id)
            expect(ContextVersion.updateBy.args[0][2]).to.be.object()
            expect(ContextVersion.updateBy.args[0][2].$set).to.be.object()
            expect(ContextVersion.updateBy.args[0][2].$set['build.containerStarted']).to.be.date()
            expect(ContextVersion.updateBy.args[0][2].$set['dockerHost']).to.be.string()
            expect(ContextVersion.updateBy.args[0][2].$set['dockerHost']).to.equal(ctx.data.host)
            expect(ContextVersion.updateBy.args[0][3]).to.be.object()
            expect(ContextVersion.updateBy.args[0][3]).to.deep.equal({ multi: true })
            expect(ContextVersion.updateBy.args[0][4]).to.be.a.function()
            done()
          })
        })
      })
    })

    describe('_onError', function () {
      beforeEach(function (done) {
        ctx.worker.contextVersion = ctx.mockContextVersion
        done()
      })

      afterEach(function (done) {
        ContextVersion.updateBuildErrorByBuildId.restore()
        done()
      })

      describe('basics', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'updateBuildErrorByBuildId').yieldsAsync(null)
          done()
        })

        it('should trigger the delete host and updateBuildError', function (done) {
          ctx.worker._onError(new Error('hello'), function () {
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1)
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            )
            done()
          })
        })
      })

      describe('failures', function () {
        beforeEach(function (done) {
          sinon.stub(
            ContextVersion,
            'updateBuildErrorByBuildId'
          ).yieldsAsync(new Error("Bryan's message"))
          done()
        })

        it('should log an error if updateBuildErrorByBuildId errors', function (done) {
          ctx.worker._onError(new Error('hello'), function (err) {
            expect(err).to.not.exist()
            expect(ContextVersion.updateBuildErrorByBuildId.callCount).to.equal(1)
            expect(ContextVersion.updateBuildErrorByBuildId.args[0][0]).to.equal(
              ctx.mockContextVersion.build._id
            )
            done()
          })
        })
      })
    })
  })
})
