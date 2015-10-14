/**
 * @module unit/models/apis/docker
 */
'use strict';
require('loadenv')();
var url = require('url');
var path = require('path');

var assign = require('101/assign');
var Boom = require('dat-middleware').Boom;
var clone = require('101/clone');
var Code = require('code');
var Container = require('dockerode/lib/container');
var dockerFrame = require('docker-frame');
var Dockerode = require('dockerode');
var indexBy = require('101/index-by');
var keypather = require('keypather')();
var Lab = require('lab');
var Modem = require('docker-modem');
var multiline = require('multiline');
var pluck = require('101/pluck');
var path = require('path');
var sinon = require('sinon');
var through2 = require('through2');

var Docker = require('models/apis/docker');

var lab = exports.lab = Lab.script();

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var moduleName = path.relative(process.cwd(), __filename);

var dockerLogs = {
  success: multiline.stripIndent(function () {/*
    {"type":"docker","content":"Step 1 : ADD ./ca.pem /ca.pem","timestamp":"2015-10-09T20:11:42.000Z"}
    {"type":"docker","content":" ---> bf20e0312c8c","timestamp":"2015-10-09T20:11:42.319Z"}
    {"type":"docker","content":"Step 2 : ADD ./cert.pem /cert.pem","timestamp":"2015-10-09T20:11:42.332Z"}
    {"type":"docker","content":" ---> e1969cb6ba66","timestamp":"2015-10-09T20:11:42.556Z"}
    {"type":"docker","content":"Successfully built 6853db027fad","timestamp":"2015-10-09T20:11:43.262Z"}
    {"type":"log","content":"Runnable: Build completed successfully!","timestamp":"2015-10-09T20:11:43.657Z"}
  */}),
  successDockerImage: '6853db027fad', // must match id in log
  failure: multiline.stripIndent(function () {/*
    {"type":"docker","content":"Step 1 : ADD ./ca.pem /ca.pem","timestamp":"2015-10-09T20:11:42.000Z"}
    {"type":"docker","content":" ---> bf20e0312c8c","timestamp":"2015-10-09T20:11:42.319Z"}
    {"type":"docker","content":"Step 2 : RUN vim ./cert.pem","timestamp":"2015-10-09T20:11:42.332Z"}
    {"type":"docker","content":" ---> e1969cb6ba66","timestamp":"2015-10-09T20:11:42.556Z"}
    {"type":"docker","content":"\u001b[91m/bin/sh: 1: \u001b[0m"}
    {"type":"docker","content":"\u001b[91mvim: not found\n\u001b[0m"}
    {"type":"docker","content":"Runnable: The command [vim what] returned a non-zero code: 127\r\n","type":"error"}
  */}),
  jsonParseError: multiline.stripIndent(function () {/*
    {"type":"docker",[]
  */})
};

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
        infraCodeVersion: {
          bucket: function () {
            return {
              bucket: 'bucket',
              sourcePath: 'sourcePath'
            };
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
        toJSON: function () {
          var json = clone(ctx.mockContextVersion);
          delete json.toJSON;
          delete json.infraCodeVersion.bucket;
          return json;
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
    done();
  });

  describe('createImageBuilder', function () {
    beforeEach(function (done) {
      ctx.mockDockerTag = 'mockDockerTag';
      ctx.mockLabels = { label1: 1, label2: 2, label3: 3 };
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
      var opts = {
        contextVersion: ctx.mockContextVersion,
        dockerTag: 'dockerTag',
        network: ctx.mockNetwork,
        manualBuild: 'manualBuild',
        noCache: 'noCache',
        sessionUser: ctx.mockSessionUser,
        ownerUsername: 'ownerUsername',
        tid: 'tid'
      };
      var labels = model._createImageBuilderLabels(opts);
      var expectedLabels = assign(
        keypather.flatten(ctx.mockContextVersion.toJSON(), '.', 'contextVersion'),
        {
          dockerTag: opts.dockerTag,
          hostIp: opts.network.hostIp,
          manualBuild: opts.manualBuild,
          networkIp: opts.network.networkIp,
          noCache: opts.noCache,
          sauronHost: url.parse(model.dockerHost).hostname+':'+process.env.SAURON_PORT,
          sessionUserDisplayName: opts.sessionUser.accounts.github.displayName,
          sessionUserGithubId:    opts.sessionUser.accounts.github.id,
          sessionUserUsername:    opts.sessionUser.accounts.github.username,
          ownerUsername: opts.ownerUsername,
          tid: opts.tid,
          type: 'image-builder-container'
        }
      );
      expect(labels).to.deep.equal(expectedLabels);
      //assert type casting to string for known value originally of type Number
      expect(labels.sessionUserGithubId).to.be.a.string();
      done();
    });

    it('should cast all values of flattened labels object to strings', function (done) {
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser,
        tid: '0000-0000-0000-0000'
      });
      expect(imageBuilderContainerLabels['contextVersion._id']).to.equal(ctx.mockContextVersion._id);
      done();
    });

    it('should not error if value is undefined', function (done) {
      ctx.mockContextVersion.toJSON = function () {
        return {
          '_id': undefined
        };
      };
      var imageBuilderContainerLabels = model._createImageBuilderLabels({
        contextVersion: ctx.mockContextVersion,
        network: ctx.mockNetwork,
        sessionUser: ctx.mockSessionUser,
        tid: '0000-0000-0000-0000'
      });
      expect(imageBuilderContainerLabels['contextVersion._id']).to.equal('undefined');
      done();
    });
  });

  describe('_createImageBuilderEnv', function () {
    beforeEach(function (done) {
      ctx.opts = {
        contextVersion: ctx.mockContextVersion,
        dockerTag: 'dockerTag',
        sauronHost: 'sauronHost',
        networkIp: 'networkIp',
        hostIp: 'hostIp',
        noCache: false
      };
      done();
    });
    describe('no cache', function() {
      beforeEach(function (done) {
        ctx.opts.noCache = true;
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

      it('should return an array of ENV for image builder container', function (done) {
        var opts = ctx.opts;
        var buildOpts = {
          Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES,
          forcerm: true,
          nocache: true
        };
        var envs = model._createImageBuilderEnv(opts);
        var cv = ctx.mockContextVersion;
        var appCodeVersions = cv.appCodeVersions;
        var expectedEnvs = [
          'RUNNABLE_AWS_ACCESS_KEY=' + process.env.AWS_ACCESS_KEY_ID,
          'RUNNABLE_AWS_SECRET_KEY=' + process.env.AWS_SECRET_ACCESS_KEY,
          'RUNNABLE_FILES_BUCKET='   + cv.infraCodeVersion.bucket().bucket,
          'RUNNABLE_PREFIX='         + path.join(cv.infraCodeVersion.bucket().sourcePath, '/'),
          'RUNNABLE_FILES='          + JSON.stringify(indexBy(cv.infraCodeVersion.files, 'Key')),
          'RUNNABLE_DOCKER='         + 'unix:///var/run/docker.sock',
          'RUNNABLE_DOCKERTAG='      + opts.dockerTag,
          'RUNNABLE_IMAGE_BUILDER_NAME=' + process.env.DOCKER_IMAGE_BUILDER_NAME,
          'RUNNABLE_IMAGE_BUILDER_TAG=' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
          // acv envs
          'RUNNABLE_REPO='        + 'git@github.com:'+appCodeVersions.map(pluck('repo')).join(';git@github.com:'),
          'RUNNABLE_COMMITISH='   + [appCodeVersions[0].commit, appCodeVersions[1].branch, 'master'].join(';'),
          'RUNNABLE_KEYS_BUCKET=' + process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          'RUNNABLE_DEPLOYKEY='   + appCodeVersions.map(pluck('privateKey')).join(';'),
          // network envs
          'RUNNABLE_NETWORK_DRIVER=' + process.env.RUNNABLE_NETWORK_DRIVER,
          'RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE,
          'RUNNABLE_SAURON_HOST='    + opts.sauronHost,
          'RUNNABLE_NETWORK_IP='     + opts.networkIp,
          'RUNNABLE_HOST_IP='        + opts.hostIp,
          'RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts),
          'RUNNABLE_PUSH_IMAGE=true'
        ];
        expect(envs).to.deep.equal(expectedEnvs);
        done();
      });
    });
    describe('cache', function() {
      beforeEach(function (done) {
        ctx.DOCKER_IMAGE_BUILDER_CACHE = process.env.DOCKER_IMAGE_BUILDER_CACHE;
        process.env.DOCKER_IMAGE_BUILDER_CACHE = '/cache';
        ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE = process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = '/layer-cache';
        done();
      });
      afterEach(function (done) {
        process.env.DOCKER_IMAGE_BUILDER_CACHE = ctx.DOCKER_IMAGE_BUILDER_CACHE;
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE = ctx.DOCKER_IMAGE_BUILDER_LAYER_CACHE;
        done();
      });

      it('should return conditional container env', function(done) {
        var envs = model._createImageBuilderEnv(ctx.opts);
        var buildOpts = {
          Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES,
          forcerm: true
        };
        expect(envs).to.contain([
          'DOCKER_IMAGE_BUILDER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_CACHE,
          'DOCKER_IMAGE_BUILDER_LAYER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE,
          'RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts),
        ]);
        done();
      });
    });
  });

  describe('getBuildInfo', function () {
    beforeEach(function (done) {
      sinon.stub(Container.prototype, 'logs');
      done();
    });
    afterEach(function (done) {
      Container.prototype.logs.restore();
      done();
    });

    it('should cleanse and parse logs', function (done) {
      var stream = through2();
      Container.prototype.logs.yieldsAsync(null, stream);
      model.getBuildInfo('containerId', function (err, buildInfo) {
        if (err) { return done(err); }
        expect(buildInfo.dockerImage).to.equal(dockerLogs.successDockerImage);
        expect(buildInfo.failed).to.equal(false);
        expect(buildInfo.log).to.deep.equal(
          dockerLogs.success
            .split('\n')
            .map(JSON.parse.bind(JSON))
        );
        done();
      });
      stream.write(dockerFrame(1, dockerLogs.success));
      stream.end();
    });

    describe('errors', function() {
      it('should handle docker log stream err', function(done) {
        var stream = through2();
        Container.prototype.logs.yieldsAsync(null, stream);
        var streamOn = stream.on;
        var emitErr = new Error('boom');
        sinon.stub(stream, 'on', streamErrHandlerAttached);
        model.getBuildInfo('containerId', function (err) {
          expect(err).to.exist();
          expect(err.message).to.match(/docker logs/);
          expect(err.message).to.match(new RegExp(emitErr.message));
          done();
        });
        function streamErrHandlerAttached () {
          var ret = streamOn.apply(stream, arguments);
          stream.on.restore();
          stream.emit('error', emitErr);
          return ret;
        }
      });
      it('should handle parse err', function(done) {
        var stream = through2();
        Container.prototype.logs.yieldsAsync(null, stream);
        model.getBuildInfo('containerId', function (err) {
          expect(err).to.exist();
          expect(err.message).to.match(/json parse/);
          done();
        });
        stream.write(dockerFrame(1, dockerLogs.jsonParseError));
        stream.end();
      });
      it('should handle streamCleanser err', function(done) {
        var stream = through2();
        Container.prototype.logs.yieldsAsync(null, stream);
        var emitErr = new Error('boom');
        var streamPipe = stream.pipe;
        sinon.stub(stream, 'pipe', handlePipe);
        model.getBuildInfo('containerId', function (err) {
          expect(err).to.exist();
          expect(err.message).to.match(/cleanser/);
          expect(err.message).to.match(new RegExp(emitErr.message));
          done();
        });
        function handlePipe (streamCleanser) {
          var ret = streamPipe.apply(stream, arguments);
          stream.pipe.restore();
          process.nextTick( // emit error on stream cleanser on next tick
            streamCleanser.emit.bind(streamCleanser, 'error', emitErr)
          );
          return ret;
        }
      });
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
