/**
 * @module unit/workers/container.image-builder.create
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var Code = require('code')
var noop = require('101/noop')
var omit = require('101/omit')
var sinon = require('sinon')

var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var joi = require('utils/joi')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var User = require('models/mongo/user')

var ContainerImageBuilderCreate = require('workers/container.image-builder.create')

describe('ContainerImageBuilderCreate', function () {
  var validJob = {
    contextId: 'context-id',
    contextVersionId: 'context-version-id',
    sessionUserGithubId: 'session-user-github-id',
    ownerUsername: 'owner-username',
    manualBuild: true,
    noCache: false,
    tid: 'job-tid'
  }
  var mockUser = { _id: 'user-id' }
  var mockContext = { _id: 'context-id' }
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
    sinon.stub(User, 'findByGithubIdAsync')
      .returns(Promise.resolve(mockUser))
    sinon.stub(Context, 'findOneAsync')
      .returns(Promise.resolve(mockContext))
    sinon.stub(ContextVersion, 'findOneAsync')
      .returns(Promise.resolve(mockContextVersion))
    sinon.stub(ContextVersion, 'recoverAsync')
      .returns(Promise.resolve())
    sinon.stub(ContextVersion, 'updateContainerByBuildIdAsync')
      .returns(Promise.resolve())
    sinon.stub(mockContextVersion, 'populateAsync')
      .returns(Promise.resolve())
    sinon.stub(Docker.prototype, 'createImageBuilder')
      .yieldsAsync(null, mockContainer)
    sinon.stub(Docker, 'getDockerTag')
      .returns(mockDockerTag)
    done()
  })

  afterEach(function (done) {
    User.findByGithubIdAsync.restore()
    Context.findOneAsync.restore()
    ContextVersion.findOneAsync.restore()
    ContextVersion.recoverAsync.restore()
    ContextVersion.updateContainerByBuildIdAsync.restore()
    mockContextVersion.populateAsync.restore()
    Docker.prototype.createImageBuilder.restore()
    Docker.getDockerTag.restore()
    done()
  })

  describe('validations', function () {
    describe('on validation error', function () {
      var validationError

      beforeEach(function (done) {
        validationError = new Error('thing broke... ugg sad')
        sinon.stub(joi, 'validateOrBoomAsync')
          .returns(Promise.reject(validationError))
        done()
      })

      afterEach(function (done) {
        joi.validateOrBoomAsync.restore()
        done()
      })

      it('should reject with a `TaskFatalError`', function (done) {
        ContainerImageBuilderCreate({}).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
      })

      it('should set the correct message', function (done) {
        ContainerImageBuilderCreate({}).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/failed.*validation/i)
          done()
        })
      })

      it('should set the original error in the data', function (done) {
        ContainerImageBuilderCreate({}).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.data.err).to.equal(validationError)
          done()
        })
      })

      it('should set the correct queue name in the data', function (done) {
        ContainerImageBuilderCreate({}).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.data.queue).to.equal('container.image-builder.create')
          done()
        })
      })
    }) // end 'on validation error'

    it('should resolve when given a valid job', function (done) {
      ContainerImageBuilderCreate(validJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should fatally reject with non-object `job`', function (done) {
      ContainerImageBuilderCreate(1234).asCallback(function (err) {
        expect(err).to.be.an.instanceof(TaskFatalError)
        done()
      })
    })

    it('should fatally reject without `contextId`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'contextId'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject with non-string `contextId`', function (done) {
      var invalidJob = omit(validJob, 'contextId')
      invalidJob.contextId = { foo: 'bar' }
      ContainerImageBuilderCreate(invalidJob)
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `contextVersionId`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'contextVersionId'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject with non-string `contextVersionId`', function (done) {
      var invalidJob = omit(validJob, 'contextVersionId')
      invalidJob.contextVersionId = 12345666
      ContainerImageBuilderCreate(invalidJob)
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `sessionUserGithubId`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'sessionUserGithubId'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `ownerUsername`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'ownerUsername'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject with non-string `ownerUsername`', function (done) {
      var invalidJob = omit(validJob, 'ownerUsername')
      invalidJob.ownerUsername = ['alpha', 'beta', 'gamma', 'delta', 'tau']
      ContainerImageBuilderCreate(invalidJob)
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `manualBuild`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'manualBuild'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject with non-boolean `manualBuild`', function (done) {
      var invalidJob = omit(validJob, 'manualBuild')
      invalidJob.manualBuild = 'pizza'
      ContainerImageBuilderCreate(invalidJob)
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `noCache`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'noCache'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject with non-boolean `noCache`', function (done) {
      var invalidJob = omit(validJob, 'noCache')
      invalidJob.noCache = 'sushi'
      ContainerImageBuilderCreate(invalidJob)
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })

    it('should fatally reject without `tid`', function (done) {
      ContainerImageBuilderCreate(omit(validJob, 'tid'))
        .asCallback(function (err) {
          expect(err).to.be.an.instanceof(TaskFatalError)
          done()
        })
    })
  }) // end 'validations'

  describe('fetchRequiredModels', function () {
    beforeEach(function (done) {
      ContainerImageBuilderCreate(validJob).asCallback(done)
    })

    describe('getUser', function () {
      it('should fetch the user by github id', function (done) {
        sinon.assert.calledOnce(User.findByGithubIdAsync)
        sinon.assert.calledWith(
          User.findByGithubIdAsync,
          validJob.sessionUserGithubId
        )
        done()
      })
    }) // end 'getUser'

    describe('getContext', function () {
      it('should fetch the context by id', function (done) {
        sinon.assert.calledOnce(Context.findOneAsync)
        sinon.assert.calledWith(Context.findOneAsync, validJob.contextId)
        done()
      })
    }) // end 'getContext'

    describe('getContextVersion', function () {
      it('should use the correct query', function (done) {
        sinon.assert.calledOnce(ContextVersion.findOneAsync)
        sinon.assert.calledWith(ContextVersion.findOneAsync, {
          '_id': validJob.contextVersionId,
          'build.dockerContainer': {
            $exists: false
          },
          'build.started': {
            $exists: true
          },
          'build.finished': {
            $exists: false
          }
        })
        done()
      })
    }) // end 'getContextVersion'
  }) // end 'fetchRequiredModels'

  describe('initiateBuild', function () {
    beforeEach(function (done) {
      ContainerImageBuilderCreate(validJob).asCallback(done)
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
        createOpts = Docker.prototype.createImageBuilder.firstCall.args[0]
        done()
      })

      it('should create the image builder container', function (done) {
        sinon.assert.calledOnce(Docker.prototype.createImageBuilder)
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

      it('should pass the job tid', function (done) {
        expect(createOpts.tid).to.equal(validJob.tid)
        done()
      })
    }) // end 'createImageBuilderContainer'

    describe('updateContextVersionWithContainer', function () {
      var updateOpts

      beforeEach(function (done) {
        updateOpts = ContextVersion.updateContainerByBuildIdAsync
          .firstCall.args[0]
        done()
      })

      it('should update the container by build id', function (done) {
        sinon.assert.calledOnce(ContextVersion.updateContainerByBuildIdAsync)
        done()
      })

      it('should use the correct build id', function (done) {
        expect(updateOpts.buildId).to.equal(mockContextVersion.build._id)
        done()
      })

      it('should use the correct build container id', function (done) {
        expect(updateOpts.buildContainerId).to.equal(mockContainer.id)
        done()
      })

      it('should use the correct docker tag', function (done) {
        sinon.assert.calledOnce(Docker.getDockerTag)
        expect(updateOpts.tag).to.equal(Docker.getDockerTag.returnValues[0])
        done()
      })
    }) // end 'updateContextVersionWithContainer'

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
}) // end 'ContainerImageBuilderCreate'
