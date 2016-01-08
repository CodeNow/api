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
      OnImageBuilderContainerCreate(testJob)
        .then(function () {
          done(new Error('should have thrown'))
        })
        .catch(function () {
          done()
        })
    })

    it('should throw if missing Id', function (done) {
      delete testJob.inspectData.Id
      OnImageBuilderContainerCreate(testJob)
        .then(function () {
          done(new Error('should have thrown'))
        })
        .catch(function () {
          done()
        })
    })

    it('should throw if missing contextVersion.id', function (done) {
      delete testJob.inspectData.Config.Labels['contextVersion.id']

      OnImageBuilderContainerCreate(testJob)
        .then(function () {
          done(new Error('should have thrown'))
        })
        .catch(function () {
          done()
        })
    })

    describe('findContextVersion', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findById')
        done()
      })

      afterEach(function (done) {
        ContextVersion.findById.restore()
        done()
      })

      it('should throw error if cb error', function (done) {
        var testErr = new Error('bane')
        ContextVersion.findById.yieldsAsync(testErr)

        OnImageBuilderContainerCreate(testJob)
          .then(function () {
            done(new Error('should have thrown'))
          })
          .catch(function (err) {
            expect(err.cause).to.equal(testErr)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledWith(ContextVersion.findById,
              testJob.inspectData.Config.Labels['contextVersion.id'])
            done()
          })
      })

      describe('validateContextVersion', function () {
        it('should throw TaskFatalError if cv not found', function (done) {
          ContextVersion.findById.yieldsAsync()

          OnImageBuilderContainerCreate(testJob)
            .then(function () {
              done(new Error('should have thrown'))
            })
            .catch(function (err) {
              expect(err).to.be.an.instanceof(TaskFatalError)
              expect(err.message).to.contain('not found')
              done()
            })
        })

        it('should throw TaskFatalError if contextVersion.build.containerStarted', function (done) {
          ContextVersion.findById.yieldsAsync(null, {
            build: {
              containerStarted: true
            }
          })

          OnImageBuilderContainerCreate(testJob)
            .then(function () {
              done(new Error('should have thrown'))
            })
            .catch(function (err) {
              expect(err).to.be.an.instanceof(TaskFatalError)
              expect(err.message).to.contain('already started')
              done()
            })
        })

        it('should throw TaskFatalError if !contextVersion.build.started', function (done) {
          ContextVersion.findById.yieldsAsync(null, {
            build: {
              containerStarted: false,
              started: false
            }
          })

          OnImageBuilderContainerCreate(testJob)
            .then(function () {
              done(new Error('should have thrown'))
            })
            .catch(function (err) {
              expect(err).to.be.an.instanceof(TaskFatalError)
              expect(err.message).to.contain('marked as started')
              done()
            })
        })

        it('should throw TaskFatalError if contextVersion.build.finished', function (done) {
          ContextVersion.findById.yieldsAsync(null, {
            build: {
              containerStarted: false,
              started: true,
              finished: true
            }
          })

          OnImageBuilderContainerCreate(testJob)
            .then(function () {
              done(new Error('should have thrown'))
            })
            .catch(function (err) {
              expect(err).to.be.an.instanceof(TaskFatalError)
              expect(err.message).to.contain('already finished')
              done()
            })
        })

        it('should throw TaskFatalError if build._id not found', function (done) {
          ContextVersion.findById.yieldsAsync(null, {
            build: {
              containerStarted: false,
              started: true,
              finished: false
            }
          })

          OnImageBuilderContainerCreate(testJob)
            .then(function () {
              done(new Error('should have thrown'))
            })
            .catch(function (err) {
              expect(err).to.be.an.instanceof(TaskFatalError)
              expect(err.message).to.contain('build._id not found')
              done()
            })
        })

        describe('startImageBuilderContainer', function () {
          beforeEach(function (done) {
            ContextVersion.findById.yieldsAsync(null, {
              build: {
                containerStarted: false,
                started: true,
                finished: false,
                _id: 'testId'
              }
            })
            sinon.stub(Docker.prototype, 'startImageBuilderContainerAsync')
            sinon.stub(ContextVersion, 'updateBy')
            sinon.stub(messenger, 'emitContextVersionUpdate')
            done()
          })

          afterEach(function (done) {
            Docker.prototype.startImageBuilderContainerAsync.restore()
            ContextVersion.updateBy.restore()
            messenger.emitContextVersionUpdate.restore()
            done()
          })

          it('should start container, update mongo & emit update', function (done) {
            Docker.prototype.startImageBuilderContainerAsync.returns()
            ContextVersion.updateBy.yieldsAsync()
            messenger.emitContextVersionUpdate.returns()

            OnImageBuilderContainerCreate(testJob)
              .then(function () {
                sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
                sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync,
                  testJob.inspectData.Id)

                var update = {
                  $set: {
                    'dockerHost': testJob.host
                  }
                }
                sinon.assert.calledOnce(ContextVersion.updateBy)
                sinon.assert.calledWith(ContextVersion.updateBy,
                  'build._id', 'testId', sinon.match(update), { multi: true })

                sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
                sinon.assert.calledWith(messenger.emitContextVersionUpdate,
                  testJob.contextVersion, 'build_running')
                done()
              })
              .catch(done)
          })

          describe('onError', function () {
            beforeEach(function (done) {
              sinon.stub(ContextVersion, 'updateBuildErrorByBuildId')
              Docker.prototype.startImageBuilderContainerAsync.returns()
              done()
            })

            afterEach(function (done) {
              ContextVersion.updateBuildErrorByBuildId.restore()
              done()
            })

            it('should updateBuildErrorByBuildId for error', function (done) {
              var testErr = new Error('hulahoop')
              ContextVersion.updateBy.yieldsAsync(testErr)
              ContextVersion.updateBuildErrorByBuildId.yieldsAsync()

              OnImageBuilderContainerCreate(testJob)
                .then(function () {
                  sinon.assert.calledOnce(Docker.prototype.startImageBuilderContainerAsync)
                  sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync,
                    testJob.inspectData.Id)

                  var update = {
                    $set: {
                      'dockerHost': testJob.host
                    }
                  }
                  sinon.assert.calledOnce(ContextVersion.updateBy)
                  sinon.assert.calledWith(ContextVersion.updateBy,
                    'build._id', 'testId', sinon.match(update), { multi: true })
                  done()
                })
                .catch(done)
            })
          }) // end onError
        }) // end startImageBuilderContainer
      }) // end validateContextVersion
    }) // end findContextVersion
  }) // end job validation
})
