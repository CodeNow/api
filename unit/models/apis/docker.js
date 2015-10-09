/**
 * @module unit/models/apis/docker
 */
'use strict';
require('loadenv')();
var url = require('url');

var Boom = require('dat-middleware').Boom;
var Code = require('code');
var Dockerode = require('dockerode');
var Lab = require('lab');
var Modem = require('docker-modem');
var path = require('path');
var sinon = require('sinon');

var Docker = require('models/apis/docker');

var lab = exports.lab = Lab.script();

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var moduleName = path.relative(process.cwd(), __filename);

describe('docker: '+moduleName, function () {
  var model = new Docker('http://fake.host.com');
  var ctx;

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
        toJSON: function () {
          return {};
        }
      },
      mockNetwork: {
        hostIp: '0.0.0.0',
        networkIp: '1.1.1.1'
      },
      mockSessionUser: {
        accounts: {
          github: {
            displayName: 'displayName',
            id: '12345',
            username: 'username'
          }
        }
      }
    };
    ctx.mockContextVersion.infraCodeVersion = {
      bucket: function () {
        return {
          sourcePath: 'sourcePath'
        };
      },
      files: []
    };
    ctx.mockContextVersion.appCodeVersions = [];
    done();
  });

  describe('createImageBuilder', function () {
    beforeEach(function (done) {
      ctx.mockDockerTag = 'mockDockerTag';
      ctx.mockLabels = ['label1', 'label2', 'label3'];
      ctx.mockEnv = ['env1', 'env2', 'env3'];
      sinon.stub(Docker.prototype, '_createImageBuilderValidateCV');
      sinon.stub(Docker, 'getDockerTag').returns(ctx.mockDockerTag);
      sinon.stub(Docker.prototype, '_createImageBuilderLabels').returns(ctx.mockLabels);
      sinon.stub(Docker.prototype, '_createImageBuilderEnv').returns(ctx.mockEnv);
      sinon.stub(Docker.prototype, 'createContainer').yieldsAsync();
      done();
    });
    afterEach(function (done) {
      Docker.prototype._createImageBuilderLabels.restore();
      Docker.getDockerTag.restore();
      Docker.prototype._createImageBuilderEnv.restore();
      Docker.prototype._createImageBuilderValidateCV.restore();
      Docker.prototype.createContainer.restore();
      done();
    });
    describe('no cache', function () {
      beforeEach(function (done) {
        ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE;
        delete process.env.DOCKER_IMAGE_BUILDER_CACHE;
        ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
        delete process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
        done();
      });
      afterEach(function (done) {
        process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE;
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
        done();
      });

      it('should create an image builder container', function (done) {
        var opts = {
          manualBuild: true,
          sessionUser: ctx.mockSessionUser,
          contextVersion: ctx.mockContextVersion,
          network: ctx.mockNetwork,
          noCache: false,
          tid: '000-0000-0000-0000'
        };
        model.createImageBuilder(opts, function (err) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            Docker.prototype._createImageBuilderValidateCV,
            opts.contextVersion
          );
          sinon.assert.calledWith(
            Docker.getDockerTag,
            opts.contextVersion
          );
          expect(Docker.prototype._createImageBuilderLabels.firstCall.args[0])
            .to.deep.equal({
              contextVersion: opts.contextVersion,
              dockerTag: ctx.mockDockerTag,
              manualBuild: opts.manualBuild,
              network: opts.network,
              noCache: opts.noCache,
              sessionUser: opts.sessionUser,
              ownerUsername: opts.ownerUsername,
              tid: opts.tid
            });
          expect(Docker.prototype._createImageBuilderEnv.firstCall.args[0])
            .to.deep.equal({
              dockerTag: ctx.mockDockerTag,
              hostIp: opts.network.hostIp,
              networkIp: opts.network.networkIp,
              noCache: opts.noCache,
              sauronHost: url.parse(model.dockerHost).hostname+':'+process.env.SAURON_PORT,
              contextVersion: opts.contextVersion
            });
          expect(Docker.prototype.createContainer.firstCall.args[0])
            .to.deep.equal({
              name: opts.contextVersion.build._id.toString(),
              Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
              Env: ctx.mockEnv,
              Binds: [],
              Volumes: {},
              Labels: ctx.mockLabels
            });
          done();
        });
      });

      describe('w/ image builder cache and layer cache', function() {
        beforeEach(function (done) {
          ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE;
          process.env.DOCKER_IMAGE_BUILDER_CACHE = '/builder-cache';
          ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
          process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = '/builder-layer-cache';
          done();
        });
        afterEach(function (done) {
          process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE;
          process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
          done();
        });

        it('should create an image builder container', function (done) {
          var opts = {
            manualBuild: true,
            sessionUser: ctx.mockSessionUser,
            contextVersion: ctx.mockContextVersion,
            network: ctx.mockNetwork,
            noCache: false,
            tid: '000-0000-0000-0000'
          };
          model.createImageBuilder(opts, function (err) {
            if (err) { return done(err); }
            var volumes = {};
            volumes['/cache'] = {};
            volumes['/layer-cache'] = {};
            expect(Docker.prototype.createContainer.firstCall.args[0])
              .to.deep.equal({
                name: opts.contextVersion.build._id.toString(),
                Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
                Env: ctx.mockEnv,
                Binds: [
                  process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw',
                  process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw'
                ],
                Volumes: volumes,
                Labels: ctx.mockLabels
              });
            done();
          });
        });
      });
    });
  });

  describe('_createImageBuilderValidateCV', function () {
    it('should return an error if contextVersion already built', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: true
        }
      });
      expect(validationError.message).to.equal('Version already built');
      done();
    });

    it('should return an error if contextVersion has no icv', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        }
      });
      expect(validationError.message).to.equal('Cannot build a version without a Dockerfile');
      done();
    });

    it('should return an error if contextVersion icv not populated', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        },
        infraCodeVersion: '012345678901234567890123' // validation check regex string length 24
      });
      expect(validationError.message).to.equal('Populate infraCodeVersion before building it');
      done();
    });

    it('should return falsy if no error condition present', function (done) {
      var validationError = model._createImageBuilderValidateCV({
        build: {
          completed: false
        },
        infraCodeVersion: {}
      });
      expect(validationError).to.be.undefined();
      done();
    });
  });

  describe('_createImageBuilderLabels', function () {
    it('should return a hash of container labels', function (done) {
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser,
        tid: '0000-0000-0000-0000'
      });
      expect(imageBuilderContainerLabels.tid).to.equal('0000-0000-0000-0000');
      //assert type casting to string for known value originally of type Number
      expect(imageBuilderContainerLabels.sessionUserGithubId).to.be.a.string();
      done();
    });
  });

  describe('_createImageBuilderEnv', function () {
    it('should return an array of ENV key/value pairs for image builder container', function (done) {
      var imageBuilderContainerEnvs = model._createImageBuilderEnv({
        contextVersion: ctx.mockContextVersion,
        dockerTag: 'docker-tag'
      });
      expect(imageBuilderContainerEnvs.indexOf('RUNNABLE_DOCKERTAG=docker-tag'))
        .to.not.equal(0);
      done();
    });
  });

  describe('getLogs', function () {
    it('should call error handler and return error', function (done) {
      sinon.stub(Dockerode.prototype, 'getContainer', function () {
        return {
          logs: function (opts, cb) {
            cb(new Error('Some docker error'));
          }
        };
      });
      sinon.spy(model, 'handleErr');
      model.getLogs('some-container-id', function (err) {
        expect(err).to.exist();
        expect(err.isBoom).to.be.true();
        expect(err.data.err.message).to.equal('Some docker error');
        expect(err.data.docker.containerId).to.equal('some-container-id');
        expect(Dockerode.prototype.getContainer.callCount).to.equal(1);
        expect(Dockerode.prototype.getContainer.getCall(0).args[0])
          .to.equal('some-container-id');
        expect(model.handleErr.callCount).to.equal(1);
        Dockerode.prototype.getContainer.restore();
        model.handleErr.restore();
        done();
      });
    });
    it('should call error but return success', function (done) {
      sinon.stub(Dockerode.prototype, 'getContainer', function () {
        return {
          logs: function (opts, cb) {
            cb(null);
          }
        };
      });
      sinon.spy(model, 'handleErr');
      model.getLogs('some-container-id', function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.getContainer.callCount).to.equal(1);
        expect(Dockerode.prototype.getContainer.getCall(0).args[0])
          .to.equal('some-container-id');
        expect(model.handleErr.callCount).to.equal(1);
        Dockerode.prototype.getContainer.restore();
        model.handleErr.restore();
        done();
      });
    });
  });

  describe('pullImage', function () {
    var testTag = 'lothlorien';
    var testImageName = 'registy.runnable.com/1234/galadriel';
    var testImage = testImageName + ':' + testTag;
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'pull');
      sinon.stub(Modem.prototype, 'followProgress');
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.pull.restore();
      Modem.prototype.followProgress.restore();
      done();
    });

    it('should pull image', function (done) {
      Dockerode.prototype.pull.yieldsAsync();
      Modem.prototype.followProgress.yieldsAsync();
      model.pullImage(testImage, function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.pull
          .withArgs(testImage)
          .calledOnce).to.be.true();
        done();
      });
    });

    it('should cb error if pull err', function (done) {
      var testErr = 'sauron attacks';
      Dockerode.prototype.pull.yieldsAsync(testErr);
      model.pullImage(testImage, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });

    it('should cb error if follow err', function (done) {
      var testErr = 'mavis attacks';
      Dockerode.prototype.pull.yieldsAsync();
      Modem.prototype.followProgress.yieldsAsync(testErr);
      model.pullImage(testImage, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });
  }); // end pullImage
  describe('with retries', function () {
    describe('and no errors', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'inspectContainer', function (container, cb) {
          cb(undefined, { dockerContainer: container });
        });
        done();
      });
      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should return callback with', function (done) {
        var docker = new Docker('https://localhost:4242');
        docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err, result) {
          expect(err).to.be.undefined();
          expect(result.dockerContainer).to.equal('some-container-id');
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
          done();
        });
      });
    });

    describe('and errors', function () {
      beforeEach(function (done) {
        var dockerErr = Boom.notFound('Docker error');
        sinon.stub(Docker.prototype, 'inspectContainer').yieldsAsync(dockerErr);
        done();
      });

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should call original docker method 5 times and return error', function (done) {
        var docker = new Docker('https://localhost:4242');
        docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err) {
          expect(err.output.statusCode).to.equal(404);
          expect(err.output.payload.message).to.equal('Docker error');
          expect(Docker.prototype.inspectContainer.callCount).to.equal(5);
          done();
        });
      });

      it('should not retry if ignoreStatusCode was specified', function (done) {
        var docker = new Docker('https://localhost:4242');
        docker.inspectContainerWithRetry({times: 6, ignoreStatusCode: 404}, 'some-container-id', function (err) {
          expect(err).to.be.null();
          expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
          done();
        });
      });
    });

    describe('with 4 errors and success', function () {
      beforeEach(function (done) {
        var dockerErr = Boom.notFound('Docker error');
        var attemts = 0;
        sinon.stub(Docker.prototype, 'inspectContainer', function (container, cb) {
          attemts++;
          if (attemts < 4) {
            cb(dockerErr);
          }
          else {
            cb(undefined, { dockerContainer: container });
          }
        });
        done();
      });

      afterEach(function (done) {
        Docker.prototype.inspectContainer.restore();
        done();
      });

      it('should call original docker method with retries on error and final success', function (done) {

        var docker = new Docker('https://localhost:4242');

        docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err, result) {
          expect(err).to.be.undefined();
          expect(result.dockerContainer).to.equal('some-container-id');
          expect(Docker.prototype.inspectContainer.callCount).to.equal(4);
          done();
        });
      });
    });
  });
});
