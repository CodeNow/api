/**
 * @module unit/workers/on-image-builder-container-create
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var Code = require('code')
var path = require('path')
var sinon = require('sinon')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var messenger = require('socket/messenger')
var OnImageBuilderContainerCreate = require('workers/on-image-builder-container-create')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var moduleName = path.relative(process.cwd(), __filename)

describe('OnImageBuilderContainerCreate: ' + moduleName, function () {
  var testJobData = require('../fixtures/docker-listener/build-image-container')
  var testJob

  beforeEach(function (done) {
    testJob = clone(testJobData)
    done()
  })

  describe('job validation', function () {
    it('should throw if missing host', function (done) {
      delete testJob.host
      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/host.*required/)
        done()
      })
    })

    it('should throw if missing Id', function (done) {
      delete testJob.inqspectData.Id
      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/Id.*required/)
        done()
      })
    })

    it('should throw if missing contextVersion.id', function (done) {
      delete testJob.inspectData.Config.Labels['contextVersion.id']

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.match(/contextVersion.id.*required/)
        done()
      })
    })
  }) // end job validation

  describe('findContextVersion', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findByIdAsync')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findByIdAsync.restore()
      done()
    })

    it('should throw error if cb error', function (done) {
      var testErr = new Error('bane')
      ContextVersion.findByIdAsync.throws(testErr)

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.equal(testErr)
        sinon.assert.calledOnce(ContextVersion.findByIdAsync)
        sinon.assert.calledWith(ContextVersion.findByIdAsync, testJob.inspectData.Config.Labels['contextVersion.id'])
        done()
      })
    })
  }) // end findContextVersion

  describe('validateContextVersion', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findByIdAsync')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findByIdAsync.restore()
      done()
    })

    it('should throw TaskFatalError if cv not found', function (done) {
      ContextVersion.findByIdAsync.returns()

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('not found')
        done()
      })
    })

    it('should throw TaskFatalError if contextVersion.build.containerStarted', function (done) {
      ContextVersion.findByIdAsync.returns({
        build: {
          containerStarted: true
        }
      })

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('already started')
        done()
      })
    })

    it('should throw TaskFatalError if !contextVersion.build.started', function (done) {
      ContextVersion.findByIdAsync.returns({
        build: {
          containerStarted: false,
          started: false
        }
      })

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('marked as started')
        done()
      })
    })

    it('should throw TaskFatalError if contextVersion.build.finished', function (done) {
      ContextVersion.findByIdAsync.returns({
        build: {
          containerStarted: false,
          started: true,
          finished: true
        }
      })

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('already finished')
        done()
      })
    })

    it('should throw TaskFatalError if build._id not found', function (done) {
      ContextVersion.findByIdAsync.returns({
        build: {
          containerStarted: false,
          started: true,
          finished: false
        }
      })

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        expect(err.message).to.contain('build._id not found')
        done()
      })
    })
  }) // end validateContextVersion

  describe('startImageBuilderContainer', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateByAsync')
      sinon.stub(ContextVersion, 'findByIdAsync').returns({
        build: {
          containerStarted: false,
          started: true,
          finished: false,
          _id: 'testId'
        }
      })
      sinon.stub(Docker.prototype, 'startImageBuilderContainerAsync')
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findByIdAsync.restore()
      ContextVersion.updateByAsync.restore()
      Docker.prototype.startImageBuilderContainerAsync.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })

    it('should start container, update mongo & emit update', function (done) {
      Docker.prototype.startImageBuilderContainerAsync.returns()
      ContextVersion.updateByAsync.returns()
      messenger.emitContextVersionUpdate.returns()

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
        sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, testJob.inspectData.Id)

        var update = {
          $set: {
            'dockerHost': testJob.host
          }
        }

        sinon.assert.calledOnce(ContextVersion.updateByAsync)
        sinon.assert.calledWith(ContextVersion.updateByAsync, 'build._id', 'testId', sinon.match(update), { multi: true })

        sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
        sinon.assert.calledWith(messenger.emitContextVersionUpdate, testJob.contextVersion, 'build_running')
        done()
      })
    })
  }) // end startImageBuilderContainer

  describe('onError', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findByIdAsync').returns({
        build: {
          containerStarted: false,
          started: true,
          finished: false,
          _id: 'testId'
        }
      })
      sinon.stub(ContextVersion, 'updateByAsync')
      sinon.stub(ContextVersion, 'updateBuildErrorByBuildIdAsync')
      sinon.stub(Docker.prototype, 'startImageBuilderContainerAsync').returns()
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })

    afterEach(function (done) {
      ContextVersion.updateBuildErrorByBuildIdAsync.restore()
      ContextVersion.findByIdAsync.restore()
      ContextVersion.updateByAsync.restore()
      Docker.prototype.startImageBuilderContainerAsync.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })

    it('should updateBuildErrorByBuildIdAsync for error', function (done) {
      var testErr = new Error('hulahoop')
      ContextVersion.updateByAsync.throws(testErr)
      ContextVersion.updateBuildErrorByBuildIdAsync.returns()

      OnImageBuilderContainerCreate(testJob).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
        sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, testJob.inspectData.Id)

        var update = {
          $set: {
            'dockerHost': testJob.host
          }
        }
        sinon.assert.calledOnce(ContextVersion.updateByAsync)
        sinon.assert.calledWith(ContextVersion.updateByAsync, 'build._id', 'testId', sinon.match(update), { multi: true })
        done()
      })
    })
  }) // end onError
})
