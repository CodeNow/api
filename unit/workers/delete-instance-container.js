'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var Boom = require('dat-middleware').Boom;
var DeleteInstanceContainer = require('workers/delete-instance-container');
var Docker = require('models/apis/docker');
var Hosts = require('models/redis/hosts');
var Sauron = require('models/apis/sauron');

describe('Worker: delete-instance-container', function () {

  describe('#handle', function () {
    it('should fail job if sauron call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instance: {
          container: {
            dockerHost: 'https://localhost:4242'
          }
        }
      });
      sinon.stub(Sauron.prototype, 'detachHostFromContainer', function (networkIp, hostIp, container, cb) {
        cb(Boom.badRequest('Sauron error'));
      });
      worker.handle(function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Sauron error');
        Sauron.prototype.detachHostFromContainer.restore();
        done();
      });
    });
    it('should fail job if hosts call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instance: {
          container: {
            dockerHost: 'https://localhost:4242'
          }
        }
      });
      sinon.stub(Sauron.prototype, 'detachHostFromContainer', function (networkIp, hostIp, container, cb) {
        cb(null);
      });
      sinon.stub(Hosts.prototype, 'removeHostsForInstance',
        function (ownerUsername, instance, instanceName, container, cb) {
          cb(Boom.badRequest('Hosts error'));
        });
      worker.handle(function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Hosts error');
        Sauron.prototype.detachHostFromContainer.restore();
        Hosts.prototype.removeHostsForInstance.restore();
        done();
      });
    });
    it('should fail job if docker.stopContainer call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instance: {
          container: {
            dockerHost: 'https://localhost:4242'
          }
        }
      });
      sinon.stub(Sauron.prototype, 'detachHostFromContainer', function (networkIp, hostIp, container, cb) {
        cb(null);
      });
      sinon.stub(Hosts.prototype, 'removeHostsForInstance',
        function (ownerUsername, instance, instanceName, container, cb) {
          cb(null);
        });
      sinon.stub(Docker.prototype, 'stopContainer', function (container, force, cb) {
        cb(Boom.badRequest('Docker stopContainer error'));
      });
      worker.handle(function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Docker stopContainer error');
        Sauron.prototype.detachHostFromContainer.restore();
        Hosts.prototype.removeHostsForInstance.restore();
        Docker.prototype.stopContainer.restore();
        done();
      });
    });
    it('should fail job if docker.removeContainer call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instance: {
          container: {
            dockerHost: 'https://localhost:4242'
          }
        }
      });
      sinon.stub(Sauron.prototype, 'detachHostFromContainer', function (networkIp, hostIp, container, cb) {
        cb(null);
      });
      sinon.stub(Hosts.prototype, 'removeHostsForInstance',
        function (ownerUsername, instance, instanceName, container, cb) {
          cb(null);
        });
      sinon.stub(Docker.prototype, 'stopContainer', function (container, force, cb) {
        cb(null);
      });
      sinon.stub(Docker.prototype, 'removeContainer', function (container, cb) {
        cb(Boom.badRequest('Docker removeContainer error'));
      });
      worker.handle(function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Docker removeContainer error');
        Sauron.prototype.detachHostFromContainer.restore();
        Hosts.prototype.removeHostsForInstance.restore();
        Docker.prototype.stopContainer.restore();
        Docker.prototype.removeContainer.restore();
        done();
      });
    });
  });
});
