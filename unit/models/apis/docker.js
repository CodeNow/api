'use strict';

var Boom = require('dat-middleware').Boom;
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var noop = require('101/noop');

require('loadenv')();
var Docker = require('models/apis/docker');
var Dockerode = require('dockerode');
var Modem = require('docker-modem');

describe('docker', function () {
  var model = new Docker('http://fake.host.com');

  describe('startUserContainer', function () {
    afterEach(function (done) {
      model.startContainer.restore();
      done();
    });

    it('should not include charon if env variable is not set', function (done) {
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(1);
        done();
      });
      model.startUserContainer({}, '', {}, noop);
    });

    it('should include charon as the first dns when evn is set', function (done) {
      var host = process.env.CHARON_HOST = '10.10.10.10';
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(2);
        expect(opts.Dns[0]).to.equal(host);
        delete process.env.CHARON_HOST;
        done();
      });
      model.startUserContainer({}, '', {}, noop);
    });

    it('should use the charon weave ip for codenow', function(done) {
      var owner = process.env.CODENOW_GITHUB_ID;
      var host = process.env.CODENOW_CHARON_WEAVE_IP = '1.1.1.1';
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(2);
        expect(opts.Dns[0]).to.equal(host);
        delete process.env.CODENOW_CHARON_WEAVE_IP;
        done();
      });
      model.startUserContainer({}, owner, {}, noop);
    });
  }); // end 'startUserContainer'

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
    it('should call original docker method 6 times if failed and return error', function (done) {
      var dockerErr = Boom.notFound('Docker error');
      sinon.stub(Docker.prototype, 'inspectContainer', function (container, cb) {
        cb(dockerErr);
      });
      var docker = new Docker('https://localhost:4242');

      docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err) {
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('Docker error');
        expect(Docker.prototype.inspectContainer.callCount).to.equal(6);
        Docker.prototype.inspectContainer.restore();
        done();
      });
    });
    it('should return callback with success on success', function (done) {
      sinon.stub(Docker.prototype, 'inspectContainer', function (container, cb) {
        cb(undefined, { dockerContainer: container });
      });
      var docker = new Docker('https://localhost:4242');

      docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err, result) {
        expect(err).to.be.undefined();
        expect(result.dockerContainer).to.equal('some-container-id');
        expect(Docker.prototype.inspectContainer.callCount).to.equal(1);
        Docker.prototype.inspectContainer.restore();
        done();
      });
    });

    it('should call original docker method with retries on error and final success', function (done) {
      var dockerErr = Boom.notFound('Docker error');
      var attemts = 0;
      sinon.stub(Docker.prototype, 'inspectContainer', function (container, cb) {
        attemts++;
        if (attemts > 4) {
          cb(dockerErr);
        }
        else {
          cb(undefined, { dockerContainer: container });
        }
      });
      var docker = new Docker('https://localhost:4242');

      docker.inspectContainerWithRetry({times: 6}, 'some-container-id', function (err) {
        expect(err).to.be.undefined();
        expect(result.dockerContainer).to.equal('some-container-id');
        expect(Docker.prototype.inspectContainer.callCount).to.equal(5);
        Docker.prototype.inspectContainer.restore();
        done();
      });
    });
  });
});
