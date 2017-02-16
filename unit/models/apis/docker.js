/**
 * @module unit/models/apis/docker
 */
'use strict'
require('loadenv')()

var clone = require('101/clone')
var Code = require('code')
var createCount = require('callback-count')
var Dockerode = require('dockerode')
var error = require('error')
var indexBy = require('101/index-by')
var joi = require('utils/joi')
var keypather = require('keypather')()
var Lab = require('lab')
var monitor = require('monitor-dog')
var path = require('path')
var pluck = require('101/pluck')
var sinon = require('sinon')
var url = require('url')

var Docker = require('models/apis/docker')

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var moduleName = path.relative(process.cwd(), __filename)
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr)
    done()
  }
}

describe('docker: ' + moduleName, function () {
  var model = new Docker()
  var testMemory = 12341234
  var ctx

  describe('constructor', function () {
    it('should load docker with no args with swarm', function (done) {
      var client = new Docker()

      var parsed = url.parse(process.env.SWARM_HOST)
      expect(client.dockerHost).to.equal(parsed.protocol + '//' + parsed.host)
      expect(client.port).to.equal(parsed.port)
      expect(client.docker).to.exist()
      done()
    })

    it('should load docker with non host args with swarm', function (done) {
      var client = new Docker({ timeout: 99999 })

      var parsed = url.parse(process.env.SWARM_HOST)
      expect(client.dockerHost).to.equal(parsed.protocol + '//' + parsed.host)
      expect(client.port).to.equal(parsed.port)
      expect(client.docker).to.exist()
      done()
    })

    it('should load docker with host args with passed host', function (done) {
      var testHost = 'http://test:4242'
      var client = new Docker({ host: testHost })

      var parsed = url.parse(testHost)
      expect(client.dockerHost).to.equal(parsed.protocol + '//' + parsed.host)
      expect(client.port).to.equal(parsed.port)
      expect(client.docker).to.exist()
      done()
    })

    it('should throw if invalid host', function (done) {
      var test
      expect(function () {
        test = new Docker({ host: 1234 })
      }).to.throw()
      // hack for standard
      expect(test).to.not.exist()
      done()
    })
  }) // end constructor

  beforeEach(function (done) {
    ctx = {
      mockContextVersion: {
        _id: 'versionId',
        build: {
          _id: 'buildId'
        },
        owner: {
          github: 'owner'
        },
        context: 'contextId',
        infraCodeVersion: {
          bucket: function () {
            return {
              bucket: 'bucket',
              sourcePath: 'sourcePath'
            }
          },
          files: []
        },
        appCodeVersions: [
          {
            repo: 'github.com/user/repo1',
            commit: 'commit',
            privateKey: 'private1'
          },
          {
            repo: 'github.com/user/repo2',
            branch: 'branch',
            privateKey: 'private2'
          },
          {
            repo: 'github.com/user/repo2',
            privateKey: 'private2'
          }
        ],
        getUserContainerMemoryLimit: sinon.stub().returns(testMemory),
        toJSON: function () {
          var json = clone(ctx.mockContextVersion)
          delete json.toJSON
          delete json.infraCodeVersion.bucket
          return json
        }
      },
      mockNetwork: {
        hostIp: '0.0.0.0'
      },
      mockSessionUser: {
        accounts: {
          github: {
            displayName: 'displayName',
            id: 12345,
            username: 'username'
          }
        }
      }
    }
    done()
  })

  describe('createSwarmConstraints', function () {
    it('should format constraints correctly', function (done) {
      var out = Docker.createSwarmConstraints([{
        name: 'org',
        type: 'hard',
        value: 1234
      }, {
        name: 'node',
        type: 'soft',
        value: 'ip-10-1-1-2'
      }])
      expect(out).to.equal('["org==1234","node==~ip-10-1-1-2"]')
      done()
    })
  }) // end createSwarmConstraints

  describe('_getSwarmNodename', function () {
    it('should format node name correctly', function (done) {
      var out = Docker._getSwarmNodename('http://10.10.10.1:4242', '1234')
      expect(out).to.equal('ip-10-10-10-1.1234')
      done()
    })
  }) // end createSwarmConstraints

  describe('_handleCreateContainerError', function () {
    var mockOrgId = '12345'
    var mockCreateOpts = {
      Labels: {
        'com.docker.swarm.constraints': '["org==' + mockOrgId + '"]'
      },
      Memory: 1024
    }

    beforeEach(function (done) {
      sinon.stub(monitor, 'event')
      sinon.stub(error, 'log')
      done()
    })

    afterEach(function (done) {
      monitor.event.restore()
      error.log.restore()
      done()
    })

    it('should shortcircut if create options are invalid', function (done) {
      model._handleCreateContainerError(new Error('wow'), 'neat', function (err) {
        expect(err).to.equal(err)
        expect(err.data).to.not.exist()
        done()
      })
    })

    it('should alert if there is no dock for an org', function (done) {
      var noNodeErr = new Error(
        'flufzzz' + 'unable to find a node that satisfies' + 'wowowo0092'
      )
      model._handleCreateContainerError(noNodeErr, mockCreateOpts, function (err) {
        expect(err).to.equal(noNodeErr)
        expect(err.data.level).to.equal('critical')
        sinon.assert.calledOnce(monitor.event)
        sinon.assert.calledWith(monitor.event, sinon.match({
          title: sinon.match('Cannot find dock for org: ' + mockOrgId),
          text: sinon.match(/Container create options:/),
          alert_type: sinon.match('error')
        }))
        sinon.assert.calledOnce(error.log)
        sinon.assert.calledWith(error.log, err)
        done()
      })
    })

    it('should alert if our of resources', function (done) {
      var resourceErr = new Error(
        'somethingsomething' + 'no resources available to schedule' + 'wozie'
      )
      model._handleCreateContainerError(resourceErr, mockCreateOpts, function (err) {
        expect(err).to.equal(resourceErr)
        expect(err.data.level).to.equal('error')
        sinon.assert.calledOnce(monitor.event)
        sinon.assert.calledWith(monitor.event, sinon.match({
          title: sinon.match('Out of dock resources for org: ' + mockOrgId),
          text: sinon.match(/Container create options:/),
          alert_type: sinon.match('error')
        }))
        sinon.assert.calledOnce(error.log)
        sinon.assert.calledWith(error.log, err)
        done()
      })
    })

    it('should pass the error through if it is not special', function (done) {
      var testErr = new Error('unicorns rule!')
      model._handleCreateContainerError(testErr, {}, function (err) {
        expect(err).to.equal(testErr)
        expect(monitor.event.called).to.be.false()
        expect(error.log.called).to.be.false()
        done()
      })
    })
  }) // end _handleCreateContainerError

  describe('_addCmdToDataFromInstance', () => {
    it('should not add Cmd if command does not exist', (done) => {
      let output = {}
      Docker._addCmdToDataFromInstance(output, {})
      expect(output.Cmd).to.be.undefined()
      done()
    })

    it('should return command in array form', (done) => {
      let output = {}
      Docker._addCmdToDataFromInstance(output, {
        containerStartCommand: 'this command runs'
      })
      expect(output.Cmd).to.equal(['this', 'command', 'runs'])
      done()
    })
  }) // end _addCmdToDataFromInstance

  describe('_isImageNotFoundErr', function () {
    it('should return true if error matches', function (done) {
      var result = Docker._isImageNotFoundErr({
        statusCode: 500,
        message: 'image 157693/558dae5e7562460d0024f5a8:5668ccbacdab6c1e0054a780 not found'
      })
      expect(result).to.equal(true)
      done()
    })

    it('should return false if error does not match', function (done) {
      var result = Docker._isImageNotFoundErr({
        statusCode: 400,
        message: 'unknown error'
      })
      expect(result).to.equal(false)
      done()
    })
  }) // end _isImageNotFoundErr

  describe('_isSocketHangupErr', function () {
    it('should return true if error matches', function (done) {
      var result = Docker._isSocketHangupErr({
        message: 'Error: Create container failed: socket hang up'
      })
      expect(result).to.equal(true)
      done()
    })

    it('should return false if error does not match', function (done) {
      var result = Docker._isSocketHangupErr({
        statusCode: 400,
        message: 'unknown error'
      })
      expect(result).to.equal(false)
      done()
    })
  })

  describe('createImageBuilder', function () {
    beforeEach(function (done) {
      ctx.mockDockerTag = 'mockDockerTag'
      ctx.mockLabels = { label1: 1, label2: 2, label3: 3 }
      ctx.mockEnv = [ 'env1', 'env2', 'env3' ]
      sinon.stub(Docker.prototype, '_createImageBuilderValidateCV')
      sinon.stub(Docker, 'getDockerTag').returns(ctx.mockDockerTag)
      sinon.stub(Docker.prototype, '_createImageBuilderLabels').returns(ctx.mockLabels)
      sinon.stub(Docker.prototype, '_createImageBuilderEnv').returns(ctx.mockEnv)
      sinon.stub(Docker.prototype, 'createContainer').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      Docker.prototype._createImageBuilderLabels.restore()
      Docker.getDockerTag.restore()
      Docker.prototype._createImageBuilderEnv.restore()
      Docker.prototype._createImageBuilderValidateCV.restore()
      Docker.prototype.createContainer.restore()
      done()
    })

    describe('no cache', function () {
      beforeEach(function (done) {
        ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE
        delete process.env.DOCKER_IMAGE_BUILDER_CACHE
        ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        delete process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        done()
      })

      afterEach(function (done) {
        process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        done()
      })

      it('should create an image builder container', function (done) {
        var opts = {
          manualBuild: true,
          sessionUser: ctx.mockSessionUser,
          contextVersion: ctx.mockContextVersion,
          ownerUsername: 'runnable',
          noCache: false,
          tid: 'mediocre-tid'
        }
        model.createImageBuilder(opts, function (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Docker.prototype._createImageBuilderValidateCV,
            opts.contextVersion
          )
          sinon.assert.calledWith(
            Docker.getDockerTag,
            opts.contextVersion
          )

          expect(Docker.prototype._createImageBuilderLabels.firstCall.args[0]).to.equal({
            contextVersion: opts.contextVersion,
            manualBuild: opts.manualBuild,
            noCache: opts.noCache,
            sessionUser: opts.sessionUser,
            ownerUsername: opts.ownerUsername,
            tid: opts.tid,
            dockerTag: ctx.mockDockerTag
          })
          expect(Docker.prototype._createImageBuilderEnv.firstCall.args[0]).to.equal({
            dockerTag: ctx.mockDockerTag,
            noCache: opts.noCache,
            contextVersion: opts.contextVersion
          })

          var expected = {
            Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
            Env: ctx.mockEnv,
            HostConfig: {
              Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
              CapDrop: process.env.CAP_DROP.split(','),
              Memory: process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES,
              MemoryReservation: testMemory
            },
            Labels: ctx.mockLabels
          }

          sinon.assert.calledOnce(Docker.prototype.createContainer)
          sinon.assert.calledWith(Docker.prototype.createContainer, expected)
          done()
        })
      })

      it('should create an image builder container with more memory than the max memory', function (done) {
        var newMemory = process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES + 10000
        ctx.mockContextVersion.getUserContainerMemoryLimit.returns(newMemory)
        var opts = {
          manualBuild: true,
          sessionUser: ctx.mockSessionUser,
          contextVersion: ctx.mockContextVersion,
          noCache: false
        }
        model.createImageBuilder(opts, function (err) {
          if (err) { return done(err) }
          var expected = {
            Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
            Env: ctx.mockEnv,
            HostConfig: {
              Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
              CapDrop: process.env.CAP_DROP.split(','),
              Memory: newMemory,
              MemoryReservation: newMemory
            },
            Labels: ctx.mockLabels
          }

          sinon.assert.calledOnce(Docker.prototype.createContainer)
          sinon.assert.calledWith(Docker.prototype.createContainer, expected)
          done()
        })
      })

      it('should handle error if createContainer failed', function (done) {
        Docker.prototype.createContainer.yieldsAsync(new Error('boo'))

        var opts = {
          manualBuild: true,
          sessionUser: ctx.mockSessionUser,
          contextVersion: ctx.mockContextVersion,
          ownerUsername: 'runnable',
          noCache: false,
          tid: 'mediocre-tid'
        }
        model.createImageBuilder(opts, function (err) {
          expect(err).to.exist()
          sinon.assert.calledWith(
            Docker.prototype._createImageBuilderValidateCV,
            opts.contextVersion
          )
          sinon.assert.calledWith(
            Docker.getDockerTag,
            opts.contextVersion
          )
          expect(Docker.prototype._createImageBuilderLabels.firstCall.args[0]).to.equal({
            tid: opts.tid,
            contextVersion: opts.contextVersion,
            dockerTag: ctx.mockDockerTag,
            manualBuild: opts.manualBuild,
            noCache: opts.noCache,
            sessionUser: opts.sessionUser,
            ownerUsername: opts.ownerUsername
          })
          expect(Docker.prototype._createImageBuilderEnv.firstCall.args[0]).to.equal({
            dockerTag: ctx.mockDockerTag,
            noCache: opts.noCache,
            contextVersion: opts.contextVersion
          })

          var expected = {
            Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
            Env: ctx.mockEnv,
            HostConfig: {
              CapDrop: process.env.CAP_DROP.split(','),
              Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
              Memory: process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES,
              MemoryReservation: testMemory
            },
            Labels: ctx.mockLabels
          }

          sinon.assert.calledWith(
            Docker.prototype.createContainer,
            expected
          )

          done()
        })
      })

      describe('w/ image builder cache and layer cache', function () {
        beforeEach(function (done) {
          ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE
          process.env.DOCKER_IMAGE_BUILDER_CACHE = '/builder-cache'
          ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
          process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = '/builder-layer-cache'
          done()
        })
        afterEach(function (done) {
          process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE
          process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE
          done()
        })

        it('should create an image builder container', function (done) {
          var opts = {
            manualBuild: true,
            sessionUser: ctx.mockSessionUser,
            contextVersion: ctx.mockContextVersion,
            network: ctx.mockNetwork,
            noCache: false
          }
          model.createImageBuilder(opts, function (err) {
            if (err) { return done(err) }

            sinon.assert.calledOnce(Docker.prototype.createContainer)
            sinon.assert.calledWith(Docker.prototype.createContainer, {
              Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
              Env: ctx.mockEnv,
              HostConfig: {
                CapDrop: process.env.CAP_DROP.split(','),
                Binds: [
                  '/var/run/docker.sock:/var/run/docker.sock',
                  process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw',
                  process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw'
                ],
                Memory: process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES,
                MemoryReservation: testMemory
              },
              Labels: ctx.mockLabels
            })
            done()
          })
        })
      })
    })
  })

  describe('_createImageBuilderValidateCV', function () {
    it('should return an error if contextVersion already built', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: true
        }
      })
      expect(validationError.message).to.equal('Version already built')
      done()
    })

    it('should return an error if contextVersion has no icv', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        }
      })
      expect(validationError.message).to.equal('Cannot build a version without a Dockerfile')
      done()
    })

    it('should return an error if contextVersion icv not populated', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        },
        infraCodeVersion: '012345678901234567890123' // validation check regex string length 24
      })
      expect(validationError.message).to.equal('Populate infraCodeVersion before building it')
      done()
    })

    it('should return falsy if no error condition present', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        },
        infraCodeVersion: {}
      })
      expect(validationError).to.be.undefined()
      done()
    })
  })

  describe('_createImageBuilderLabels', function () {
    it('should return a hash of container labels', function (done) {
      var opts = {
        contextVersion: ctx.mockContextVersion,
        dockerTag: 'dockerTag',
        network: ctx.mockNetwork,
        manualBuild: 'manualBuild',
        noCache: 'noCache',
        sessionUser: ctx.mockSessionUser,
        ownerUsername: 'ownerUsername',
        tid: 'mediocre-tid'
      }
      var labels = model._createImageBuilderLabels(opts)
      var expectedLabels = {
        tid: opts.tid,
        githubOrgId: 'owner',
        'contextVersion.build._id': ctx.mockContextVersion.build._id,
        'contextVersion._id': ctx.mockContextVersion._id,
        contextVersionId: ctx.mockContextVersion._id,
        'contextVersion.context': ctx.mockContextVersion.context,
        dockerTag: opts.dockerTag,
        manualBuild: opts.manualBuild,
        noCache: opts.noCache,
        sessionUserDisplayName: opts.sessionUser.accounts.github.displayName,
        sessionUserGithubId: opts.sessionUser.accounts.github.id.toString(),
        sessionUserUsername: opts.sessionUser.accounts.github.username,
        ownerUsername: opts.ownerUsername,
        'com.docker.swarm.constraints': '["org==owner"]',
        type: 'image-builder-container'
      }
      expect(labels).to.equal(expectedLabels)
      // assert type casting to string for known value originally of type Number
      expect(labels.sessionUserGithubId).to.be.a.string()
      done()
    })

    it('should cast all values of labels object to strings', function (done) {
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        noCache: false,
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser
      })
      expect(imageBuilderContainerLabels['contextVersion._id']).to.equal(ctx.mockContextVersion._id)
      expect(imageBuilderContainerLabels.noCache).to.equal('false')
      done()
    })

    it('should return a swarm constraint orgId of 1 for personal account', function (done) {
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        noCache: false,
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: Object.assign({}, ctx.mockSessionUser, { accounts: { github: { id: 'owner' }}})
    })
      expect(imageBuilderContainerLabels['com.docker.swarm.constraints'])
        .to.equal('["org==1"]')
      done()
    })

    it('should add dock constraint if prevDockerHost exist', function (done) {
      ctx.mockContextVersion.prevDockerHost = 'http://10.0.0.1:4242'
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser
      })
      expect(imageBuilderContainerLabels['com.docker.swarm.constraints'])
        .to.equal('["org==owner"]')
      done()
    })

    it('should not add dock constraint if no prevDockerHost', function (done) {
      delete ctx.mockContextVersion.prevDockerHost
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser
      })
      expect(imageBuilderContainerLabels['com.docker.swarm.constraints'])
        .to.equal('["org==owner"]')
      done()
    })
  })

  describe('_createImageBuilderEnv', function () {
    beforeEach(function (done) {
      ctx.opts = {
        contextVersion: ctx.mockContextVersion,
        dockerTag: 'dockerTag',
        hostIp: 'hostIp',
        noCache: false
      }
      done()
    })
    describe('no cache', function () {
      beforeEach(function (done) {
        ctx.opts.noCache = true
        ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE
        delete process.env.DOCKER_IMAGE_BUILDER_CACHE
        ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        delete process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        done()
      })
      afterEach(function (done) {
        process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        done()
      })

      it('should return an array of ENV for image builder container', function (done) {
        var opts = ctx.opts
        var buildOpts = {
          forcerm: true,
          nocache: true
        }
        var envs = model._createImageBuilderEnv(opts)
        var cv = ctx.mockContextVersion
        var appCodeVersions = cv.appCodeVersions
        var expectedEnvs = [
          'RUNNABLE_AWS_ACCESS_KEY=' + process.env.AWS_ACCESS_KEY_ID,
          'RUNNABLE_AWS_SECRET_KEY=' + process.env.AWS_SECRET_ACCESS_KEY,
          'RUNNABLE_BUILD_LINE_TIMEOUT_MS=' + process.env.DOCKER_BUILD_LINE_TIMEOUT_MS,
          'RUNNABLE_DOCKER=' + 'unix:///var/run/docker.sock',
          'RUNNABLE_DOCKERTAG=' + opts.dockerTag,
          'RUNNABLE_FILES=' + JSON.stringify(indexBy(cv.infraCodeVersion.files, 'Key')),
          'RUNNABLE_FILES_BUCKET=' + cv.infraCodeVersion.bucket().bucket,
          'RUNNABLE_IMAGE_BUILDER_NAME=' + process.env.DOCKER_IMAGE_BUILDER_NAME,
          'RUNNABLE_IMAGE_BUILDER_TAG=' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
          'RUNNABLE_PREFIX=' + path.join(cv.infraCodeVersion.bucket().sourcePath, '/'),
          // acv envs
          'RUNNABLE_REPO=' + 'git@github.com:' + appCodeVersions.map(pluck('repo')).join(';git@github.com:'),
          'RUNNABLE_COMMITISH=' + [ appCodeVersions[0].commit, appCodeVersions[1].branch, 'master' ].join(';'),
          'RUNNABLE_KEYS_BUCKET=' + process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          'RUNNABLE_DEPLOYKEY=' + appCodeVersions.map(pluck('privateKey')).join(';'),
          // network envs
          'RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE,
          'NODE_ENV=' + process.env.NODE_ENV,
          'RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts)
        ]
        expect(envs).to.equal(expectedEnvs)
        done()
      })
    })
    describe('cache', function () {
      beforeEach(function (done) {
        ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE
        process.env.DOCKER_IMAGE_BUILDER_CACHE = '/cache'
        ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = '/layer-cache'
        done()
      })
      afterEach(function (done) {
        process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE
        done()
      })

      it('should return conditional container env', function (done) {
        var envs = model._createImageBuilderEnv(ctx.opts)
        var buildOpts = {
          forcerm: true
        }
        expect(envs).to.contain([
          'DOCKER_IMAGE_BUILDER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_CACHE,
          'DOCKER_IMAGE_BUILDER_LAYER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE,
          'RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts)
        ])
        done()
      })
    })
  })

  describe('getLogsAndRetryOnTimeout', function () {
    beforeEach(function (done) {
      sinon.stub(model, 'getLogs').yieldsAsync(null, { stream: true })
      done()
    })

    afterEach(function (done) {
      model.getLogs.restore()
      done()
    })
    it('should callback without error if getLogs was successful', function (done) {
      model.getLogsAndRetryOnTimeout('some-id', 'all', function (err, resp) {
        if (err) { return done(err) }
        expect(resp.stream).to.equal(true)
        sinon.assert.calledOnce(model.getLogs)
        sinon.assert.calledWith(model.getLogs, 'some-id', 'all')
        done()
      })
    })
    it('should callback with error if getLogs errored with some error', function (done) {
      var dockerError = new Error('Docker error')
      model.getLogs.yieldsAsync(dockerError)
      model.getLogsAndRetryOnTimeout('some-id', 'all', function (err, resp) {
        expect(err).to.equal(dockerError)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model.getLogs)
        sinon.assert.calledWith(model.getLogs, 'some-id', 'all')
        done()
      })
    })

    it('should retry ETIMEDOUT error', function (done) {
      var timeoutError = new Error('Docker error')
      timeoutError.data = {
        err: {
          code: 'ETIMEDOUT'
        }
      }
      model.getLogs.onCall(0).yieldsAsync(timeoutError)
      model.getLogs.onCall(1).yieldsAsync(timeoutError)
      model.getLogs.onCall(2).yieldsAsync(null, { stream: true })

      model.getLogsAndRetryOnTimeout('some-id', 'all', function (err, resp) {
        if (err) { return done(err) }
        expect(resp.stream).to.equal(true)
        sinon.assert.callCount(model.getLogs, 3)
        sinon.assert.calledWith(model.getLogs, 'some-id', 'all')
        done()
      })
    })
  })

  describe('getLogs', function () {
    beforeEach(function (done) {
      ctx.resp = { stream: 'logs' }
      sinon.stub(model, '_containerAction').yieldsAsync(null, ctx.resp)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with correct options', function (done) {
      model.getLogs('some-container-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        var opts = {
          follow: true,
          stdout: true,
          stderr: true,
          tail: 'all'
        }
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'logs', opts)
        done()
      })
    })
    it('should call _containerAction with correct tail option', function (done) {
      model.getLogs('some-container-id', 10, function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        var opts = {
          follow: true,
          stdout: true,
          stderr: true,
          tail: 10
        }
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'logs', opts)
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.getLogs('some-container-id', function (err, resp) {
        expect(err).to.equal(dockerErr)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('startContainer', function () {
    beforeEach(function (done) {
      ctx.resp = { started: true }
      sinon.stub(model, '_containerAction').yieldsAsync(null, ctx.resp)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with no options', function (done) {
      model.startContainer('some-container-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'start', {})
        done()
      })
    })
    it('should call _containerAction with correct options', function (done) {
      model.startContainer('some-container-id', { type: 'image-builder' }, function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'start', { type: 'image-builder' })
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.startContainer('some-container-id', function (err, resp) {
        expect(err).to.equal(dockerErr)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('stopContainer', function () {
    beforeEach(function (done) {
      sinon.stub(model, '_containerAction').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with correct options', function (done) {
      model.stopContainer('some-container-id', function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'stop', { t: process.env.CONTAINER_STOP_LIMIT })
        done()
      })
    })
    it('should ignore 304 if force=true', function (done) {
      var dockerErr = new Error('Docker error')
      dockerErr.output = {
        statusCode: 304
      }
      model._containerAction.yieldsAsync(dockerErr)
      model.stopContainer('some-container-id', true, function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'stop', { t: process.env.CONTAINER_STOP_LIMIT })
        done()
      })
    })
    it('should not ignore 304 if force=false', function (done) {
      var dockerErr = new Error('Docker error')
      dockerErr.output = {
        statusCode: 404
      }
      model._containerAction.yieldsAsync(dockerErr)
      model.stopContainer('some-container-id', false, function (err) {
        expect(err).to.equal(dockerErr)
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'stop', { t: process.env.CONTAINER_STOP_LIMIT })
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.stopContainer('some-container-id', function (err) {
        expect(err).to.equal(dockerErr)
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('killContainer', function () {
    beforeEach(function (done) {
      sinon.stub(model, '_containerAction').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with correct options', function (done) {
      model.killContainer('some-container-id', function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'kill', { })
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.killContainer('some-container-id', function (err) {
        expect(err).to.equal(dockerErr)
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('restartContainer', function () {
    beforeEach(function (done) {
      ctx.resp = { restarted: true }
      sinon.stub(model, '_containerAction').yieldsAsync(null, ctx.resp)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with no options', function (done) {
      model.restartContainer('some-container-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'restart', {})
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.restartContainer('some-container-id', function (err, resp) {
        expect(err).to.equal(dockerErr)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('clearContainerMemory', function () {
    var testId = 'some-container-id'
    beforeEach(function (done) {
      sinon.stub(model, '_containerAction')
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with correct args', function (done) {
      model._containerAction.yieldsAsync()
      model.clearContainerMemory(testId, function (err, resp) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, testId, 'update', {
          Memory: 4194304,
          MemoryReservation: 4194304
        })
        done()
      })
    })

    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.clearContainerMemory(testId, function (err, resp) {
        expect(err).to.equal(dockerErr)
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('removeContainer', function () {
    beforeEach(function (done) {
      ctx.resp = { removed: true }
      sinon.stub(model, '_containerAction').yieldsAsync(null, ctx.resp)
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with no options', function (done) {
      model.removeContainer('some-container-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'remove', { force: true })
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.removeContainer('some-container-id', function (err, resp) {
        expect(err).to.equal(dockerErr)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('execContainerAndRetryOnTimeout', function () {
    beforeEach(function (done) {
      sinon.stub(model, 'execContainer').yieldsAsync(null, { stream: true })
      done()
    })
    afterEach(function (done) {
      model.execContainer.restore()
      done()
    })
    it('should callback without error if execContainer was successful', function (done) {
      model.execContainerAndRetryOnTimeout('some-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp.stream).to.equal(true)
        sinon.assert.calledOnce(model.execContainer)
        sinon.assert.calledWith(model.execContainer, 'some-id')
        done()
      })
    })
    it('should callback with error if execContainer errored with some error', function (done) {
      var dockerError = new Error('Docker error')
      model.execContainer.yieldsAsync(dockerError)
      model.execContainerAndRetryOnTimeout('some-id', function (err, resp) {
        expect(err).to.equal(dockerError)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model.execContainer)
        sinon.assert.calledWith(model.execContainer, 'some-id')
        done()
      })
    })
    it('should retry ETIMEDOUT error', function (done) {
      var timeoutError = new Error('Docker error')
      timeoutError.data = {
        err: {
          code: 'ETIMEDOUT'
        }
      }
      model.execContainer.onCall(0).yieldsAsync(timeoutError)
      model.execContainer.onCall(1).yieldsAsync(timeoutError)
      model.execContainer.onCall(2).yieldsAsync(null, { stream: true })

      model.execContainerAndRetryOnTimeout('some-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp.stream).to.equal(true)
        sinon.assert.callCount(model.execContainer, 3)
        sinon.assert.calledWith(model.execContainer, 'some-id')
        done()
      })
    })
  })

  describe('execContainer', function () {
    beforeEach(function (done) {
      sinon.stub(model, '_containerAction')
      done()
    })
    afterEach(function (done) {
      model._containerAction.restore()
      done()
    })
    it('should call _containerAction with correct options', function (done) {
      var exec = {
        start: function (opts, cb) {
          cb(null)
        }
      }
      sinon.spy(exec, 'start')
      model._containerAction.yieldsAsync(null, exec)
      model.execContainer('some-container-id', function (err, resp) {
        if (err) { return done(err) }
        expect(resp).to.equal(ctx.resp)
        sinon.assert.calledOnce(model._containerAction)
        var opts = {
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: ['bash']
        }
        sinon.assert.calledWith(model._containerAction, 'some-container-id', 'exec', opts)
        sinon.assert.calledOnce(exec.start)
        sinon.assert.calledWith(exec.start, { stdin: true })
        done()
      })
    })
    it('should call _containerAction and callback with an error', function (done) {
      var dockerErr = new Error('Docker error')
      model._containerAction.yieldsAsync(dockerErr)
      model.execContainer('some-container-id', function (err, resp) {
        expect(err).to.equal(dockerErr)
        expect(resp).to.not.exist()
        sinon.assert.calledOnce(model._containerAction)
        done()
      })
    })
  })

  describe('createUserContainer', function () {
    var testMemory = 512000

    beforeEach(function (done) {
      ctx.mockInstance = {
        _id: '123456789012345678901234',
        shortHash: 'abcdef',
        elasticHostname: 'google.com',
        env: [
          'FOO=1',
          'URL=${RUNNABLE_CONTAINER_ID}-$FOO.runnableapp.com',
          'BAR=$URL'
        ]
      }
      ctx.mockContextVersion = {
        _id: '123456789012345678901234',
        build: {
          dockerTag: 'dockerTag'
        },
        appCodeVersions: [
          {
            repo: 'github.com/user/repo1',
            commit: 'commit',
            privateKey: 'private1'
          },
          {
            repo: 'github.com/user/repo2',
            branch: 'branch',
            privateKey: 'private2'
          },
          {
            repo: 'github.com/user/repo2',
            privateKey: 'private2'
          }
        ],
        getUserContainerMemoryLimit: sinon.stub().returns(testMemory)
      }

      ctx.opts = {
        instance: ctx.mockInstance,
        contextVersion: ctx.mockContextVersion,
        ownerUsername: 'runnable',
        sessionUserGithubId: 10,
        tid: 'mediocre-tid'
      }
      sinon.stub(Docker.prototype, '_createUserContainerLabels')
      sinon.stub(Docker.prototype, 'createContainer')
      done()
    })

    afterEach(function (done) {
      Docker.prototype._createUserContainerLabels.restore()
      Docker.prototype.createContainer.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        ctx.mockLabels = {}
        ctx.mockContainer = {}
        Docker.prototype._createUserContainerLabels.yieldsAsync(null, ctx.mockLabels)
        Docker.prototype.createContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a container with repo memory limit', function (done) {
        model.createUserContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Docker.prototype._createUserContainerLabels, ctx.opts, sinon.match.func
          )
          var expectedCreateOpts = {
            Labels: ctx.mockLabels,
            Env: [
              'RUNNABLE_CONTAINER_ID=' + ctx.mockInstance.shortHash,
              'RUNNABLE_CONTAINER_URL=' + ctx.mockInstance.elasticHostname,
              'FOO=1',
              'URL=' + ctx.mockInstance.shortHash + '-1.runnableapp.com',
              'BAR=' + ctx.mockInstance.shortHash + '-1.runnableapp.com'
            ],
            Image: ctx.mockContextVersion.build.dockerTag,
            HostConfig: {
              CapDrop: process.env.CAP_DROP.split(','),
              PublishAllPorts: true,
              Memory: process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES,
              MemoryReservation: testMemory
            }
          }

          sinon.assert.calledOnce(ctx.mockContextVersion.getUserContainerMemoryLimit)
          sinon.assert.calledWith(
            Docker.prototype.createContainer, expectedCreateOpts, sinon.match.func
          )

          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })

      it('should create a container with more than the maximum allowed memory', function (done) {
        var newMemoryLimit = process.env.CONTAINER_HARD_MEMORY_LIMIT_BYTES + 1000
        ctx.mockContextVersion.getUserContainerMemoryLimit.returns(newMemoryLimit)

        model.createUserContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Docker.prototype._createUserContainerLabels, ctx.opts, sinon.match.func
          )
          var expectedCreateOpts = {
            Labels: ctx.mockLabels,
            Env: [
              'RUNNABLE_CONTAINER_ID=' + ctx.mockInstance.shortHash,
              'RUNNABLE_CONTAINER_URL=' + ctx.mockInstance.elasticHostname,
              'FOO=1',
              'URL=' + ctx.mockInstance.shortHash + '-1.runnableapp.com',
              'BAR=' + ctx.mockInstance.shortHash + '-1.runnableapp.com'
            ],
            Image: ctx.mockContextVersion.build.dockerTag,
            HostConfig: {
              CapDrop: process.env.CAP_DROP.split(','),
              PublishAllPorts: true,
              Memory: newMemoryLimit,
              MemoryReservation: newMemoryLimit
            }
          }

          sinon.assert.calledOnce(ctx.mockContextVersion.getUserContainerMemoryLimit)
          sinon.assert.calledWith(
            Docker.prototype.createContainer, expectedCreateOpts, sinon.match.func
          )

          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })

      it('should create a container with run cmd', function (done) {
        ctx.opts.instance.containerStartCommand = 'keep calm and code on'

        model.createUserContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Docker.prototype.createContainer, sinon.match({
              Cmd: ['keep', 'calm', 'and', 'code', 'on']
            }), sinon.match.func
          )

          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })
    })

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })

      describe('validateOrBoom error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom')
          joi.validateOrBoom.yieldsAsync(ctx.err)
          done()
        })
        afterEach(function (done) {
          joi.validateOrBoom.restore()
          done()
        })
        it('should callback the error', function (done) {
          model.createUserContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('unbuilt cv', function () {
        beforeEach(function (done) {
          delete ctx.opts.contextVersion.build.dockerTag
          done()
        })
        it('should callback the error', function (done) {
          model.createUserContainer(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/unbuilt/)
            done()
          })
        })
      })

      describe('no instance env', function () {
        beforeEach(function (done) {
          delete ctx.opts.instance.env
          done()
        })
        it('should callback the error', function (done) {
          model.createUserContainer(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/env.*required/)
            done()
          })
        })
      })

      describe('_createUserContainerLabels error', function () {
        beforeEach(function (done) {
          Docker.prototype._createUserContainerLabels.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          model.createUserContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('createContainer error', function () {
        beforeEach(function (done) {
          ctx.mockLabels = {}
          ctx.mockContainer = {}
          Docker.prototype._createUserContainerLabels.yieldsAsync(null, ctx.mockLabels)
          Docker.prototype.createContainer.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          model.createUserContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })
    })

    describe('_evalEnvVars', function () {
      it('should do nothing for ENV vars without ENV vars', function (done) {
        var originalEnvs = [
          'HELLO=WORLD',
          'WOW=1asdfasd',
          'BASE_URL=https://app.runnable-gamma.com/CodeNow/test-ws-client/'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal(originalEnvs)
        done()
      })

      it('should do replace a single ENV var', function (done) {
        var originalEnvs = [
          'EXAMPLE=37',
          'HELLO=$EXAMPLE'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'EXAMPLE=37',
          'HELLO=37'
        ])
        done()
      })

      it('should should handle single char vars', function (done) {
        var originalEnvs = [
          'E=37',
          'H=$E'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'E=37',
          'H=37'
        ])
        done()
      })

      it('should replace mutliple ENVs with the same name', function (done) {
        var originalEnvs = [
          'EXAMPLE=37',
          'HELLO=$EXAMPLE-$EXAMPLE'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'EXAMPLE=37',
          'HELLO=37-37'
        ])
        done()
      })

      it('should replace mutliple ENVs with the differents names', function (done) {
        var originalEnvs = [
          'YOOO=3',
          'YOO=2',
          '_YO=1',
          'HELLO=_YO$_YO-YOO$YOO-YOOO$YOOO'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'YOOO=3',
          'YOO=2',
          '_YO=1',
          'HELLO=_YO1-YOO2-YOOO3'
        ])
        done()
      })

      it('should not replace invalid ENVs', function (done) {
        var originalEnvs = [
          '23=3',
          'HELLO=YO$23'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          '23=3',
          'HELLO=YO$23'
        ])
        done()
      })

      it('should replace vars inside {}', function (done) {
        var originalEnvs = [
          'YOOO=3',
          'YOO=2',
          '_YO=1',
          'HELLO=_YO${_YO}-YOO${YOO}-YOOO${YOOO}'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'YOOO=3',
          'YOO=2',
          '_YO=1',
          'HELLO=_YO1-YOO2-YOOO3'
        ])
        done()
      })

      it('should not replace vars declared before other vars are declared', function (done) {
        var originalEnvs = [
          'START=_YO${_YO}-YOO${YOO}-YOOO${YOOO}',
          'YOOO=3',
          'YOO=2',
          'MIDDLE=_YO${_YO}-YOO${YOO}-YOOO${YOOO}',
          '_YO=1',
          'HELLO=_YO${_YO}-YOO${YOO}-YOOO${YOOO}'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'START=_YO${_YO}-YOO${YOO}-YOOO${YOOO}',
          'YOOO=3',
          'YOO=2',
          'MIDDLE=_YO${_YO}-YOO2-YOOO3',
          '_YO=1',
          'HELLO=_YO1-YOO2-YOOO3'
        ])
        done()
      })

      it('should use the last declaration of a var', function (done) {
        var originalEnvs = [
          'YO=3',
          'YO=2',
          'YO=1',
          'YO="432${YO}"'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'YO=3',
          'YO=2',
          'YO=1',
          'YO="4321"'
        ])
        done()
      })

      it('should use respect recursive options when they follow an order', function (done) {
        var originalEnvs = [
          'FOO=1',
          'BAR=$FOO',
          'FOO=$BAR',
          'BAR=$FOO',
          'BAZ=$BAR',
          'FOO=$BAZ'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'FOO=1',
          'BAR=1',
          'FOO=1',
          'BAR=1',
          'BAZ=1',
          'FOO=1'
        ])
        done()
      })

      it('should handle regex ENVs', function (done) {
        var originalEnvs = [
          'B=/HI/',
          'A=$B'
        ]
        var envs = Docker._evalEnvVars(originalEnvs)
        expect(envs).to.equal([
          'B=/HI/',
          'A=/HI/'
        ])
        done()
      })
    })
  })

  describe('_containerAction', function () {
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'getContainer')
      sinon.stub(monitor, 'increment')
      sinon.spy(model, 'handleErr')
      done()
    })

    afterEach(function (done) {
      Dockerode.prototype.getContainer.restore()
      model.handleErr.restore()
      monitor.increment.restore()
      done()
    })

    describe('successful operation', function () {
      beforeEach(function (done) {
        ctx.opOpts = { opt1: true }
        ctx.opResp = { stream: 'stream' }
        ctx.containerActions = {
          exec: function (opts, cb) {
            cb(null, ctx.opResp)
          }
        }
        Dockerode.prototype.getContainer.returns(ctx.containerActions)
        sinon.spy(ctx.containerActions, 'exec')
        done()
      })
      it('should call docker operation and callback with no error', function (done) {
        model._containerAction('_container_id_', 'exec', ctx.opOpts, function (err, resp) {
          if (err) { return done(err) }
          expect(resp).to.equal(ctx.opResp)
          sinon.assert.calledOnce(Dockerode.prototype.getContainer)
          sinon.assert.calledWith(Dockerode.prototype.getContainer, '_container_id_')
          sinon.assert.calledOnce(ctx.containerActions.exec)
          sinon.assert.calledWith(ctx.containerActions.exec, ctx.opOpts)
          done()
        })
      })

      it('should incremenet action counter using monitor', function (done) {
        model._containerAction('_container_id_', 'exec', ctx.opOpts, function (err, resp) {
          if (err) { return done(err) }
          expect(resp).to.equal(ctx.opResp)
          sinon.assert.calledOnce(monitor.increment)
          sinon.assert.calledWith(monitor.increment, 'api.docker.call.exec')
          done()
        })
      })
    })

    describe('failed operation', function () {
      beforeEach(function (done) {
        ctx.opOpts = { opt1: true }
        ctx.opError = new Error('Docker error')
        ctx.containerActions = {
          exec: function (opts, cb) {
            cb(ctx.opError)
          }
        }
        Dockerode.prototype.getContainer.returns(ctx.containerActions)
        sinon.spy(ctx.containerActions, 'exec')
        done()
      })

      it('should call docker operation and handle an error', function (done) {
        model._containerAction('_container_id_', 'exec', ctx.opOpts, function (err, resp) {
          expect(err).to.exist()
          expect(err.output.payload.message).to.equal('Container action exec failed: Docker error')
          expect(resp).to.not.exist()
          sinon.assert.calledOnce(model.handleErr)
          sinon.assert.calledOnce(Dockerode.prototype.getContainer)
          sinon.assert.calledWith(Dockerode.prototype.getContainer, '_container_id_')
          sinon.assert.calledOnce(ctx.containerActions.exec)
          sinon.assert.calledWith(ctx.containerActions.exec, ctx.opOpts)
          done()
        })
      })

      it('should incremenet action counter using monitor', function (done) {
        model._containerAction('_container_id_', 'exec', ctx.opOpts, function (err, resp) {
          expect(err).to.exist()
          expect(resp).to.equal(ctx.opResp)
          sinon.assert.calledTwice(monitor.increment)
          sinon.assert.calledWith(monitor.increment, 'api.docker.call.exec')
          sinon.assert.calledWith(monitor.increment, 'api.docker.call.failure.exec', 1)
          done()
        })
      })
    })
  })

  describe('_createUserContainerLabels', function () {
    beforeEach(function (done) {
      ctx.opts = {
        instance: {
          _id: '123456789012345678901234',
          name: 'instanceName',
          shortHash: 'abcdef'
        },
        contextVersion: {
          _id: '123456789012345678901234',
          dockerHost: 'http://10.0.0.1:4242',
          owner: {
            github: 132456
          }
        },
        ownerUsername: 'runnable',
        sessionUserGithubId: 10,
        tid: 'mediocre-tid'
      }
      done()
    })

    describe('success', function () {
      it('should callback labels with node constraints', function (done) {
        model._createUserContainerLabels(ctx.opts, function (err, labels) {
          if (err) { return done(err) }
          var opts = ctx.opts
          expect(labels).to.equal({
            tid: ctx.opts.tid,
            githubOrgId: '132456',
            instanceId: opts.instance._id.toString(),
            instanceName: opts.instance.name,
            instanceShortHash: opts.instance.shortHash,
            contextVersionId: opts.contextVersion._id.toString(),
            ownerUsername: opts.ownerUsername,
            sessionUserGithubId: opts.sessionUserGithubId.toString(),
            'com.docker.swarm.constraints': '["org==132456","node==~ip-10-0-0-1.132456"]',
            type: 'user-container'
          })
          done()
        })
      })

      it('should callback labels no node constraints', function (done) {
        delete ctx.opts.contextVersion.dockerHost
        model._createUserContainerLabels(ctx.opts, function (err, labels) {
          if (err) { return done(err) }
          var opts = ctx.opts
          expect(labels).to.equal({
            tid: ctx.opts.tid,
            githubOrgId: '132456',
            instanceId: opts.instance._id.toString(),
            instanceName: opts.instance.name,
            instanceShortHash: opts.instance.shortHash,
            contextVersionId: opts.contextVersion._id.toString(),
            ownerUsername: opts.ownerUsername,
            sessionUserGithubId: opts.sessionUserGithubId.toString(),
            'com.docker.swarm.constraints': '["org==132456"]',
            type: 'user-container'
          })
          done()
        })
      })
    })

    describe('errors', function () {
      it('should callback opts validation error', function (done) {
        delete ctx.opts.contextVersion.dockerHost
        var flatOpts = keypather.flatten(ctx.opts)
        var keypaths = Object.keys(flatOpts)
        var count = createCount(keypaths.length, done)
        keypaths.forEach(function (keypath) {
          // delete 1 required keypath and expect an error for that keypath
          var opts = clone(ctx.opts)
          keypather.del(opts, keypath)
          model._createUserContainerLabels(opts, function (err) {
            expect(err, 'should require ' + keypath).to.exist()
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(new RegExp(keypath))
            count.next()
          })
        })
      })
    })
  }) // end _createUserContainerLabels

  describe('pushImage', function () {
    let pushStub
    let docker
    const testImage = 'chill/fire'
    const testTag = 'ice'
    const testImageTag = `${testImage}:${testTag}`
    beforeEach(function (done) {
      docker = new Docker()
      pushStub = {
        push: sinon.stub()
      }
      sinon.stub(docker.docker, 'getImage').returns(pushStub)
      sinon.stub(docker.docker.modem, 'followProgress')
      done()
    })

    afterEach(function (done) {
      docker.docker.getImage.restore()
      docker.docker.modem.followProgress.restore()
      done()
    })

    it('should call push', function (done) {
      const testStream = 'thisisatest'
      pushStub.push.yieldsAsync(null, testStream)
      docker.docker.modem.followProgress.yieldsAsync(null)

      docker.pushImage(testImageTag).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(docker.docker.getImage)
        sinon.assert.calledWith(docker.docker.getImage, testImage)
        sinon.assert.calledOnce(pushStub.push)
        sinon.assert.calledWith(pushStub.push, { tag: testTag }, sinon.match.func)
        done()
      })
    })

    it('should resolve error', function (done) {
      const testError = 'someerror'
      pushStub.push.yieldsAsync(testError)
      docker.pushImage(testImage).asCallback(function (err) {
        expect(err.message).to.equal(testError)
        done()
      })
    })
  }) // end pushImage
})
