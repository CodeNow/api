'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var containerFs = require('middlewares/apis/container-fs');
var containerFsAPI = require('models/apis/container-fs');

describe('container-fs', function () {
  describe('#parseParams', function () {
    it('should parse params correctly for dir', function (done) {
      var container = '0021da9eb7f3fee201cbc4b42d6efcdb8f494ba9466fb783a46f4527575d880f';
      var url = 'http://api.runnable.io/instances/eo6jxe/containers/';
      url += container + '/files/api/.git/refs/';
      var req = {
        url: url,
        params: {},
        container: {
          dockerContainer: container,
          dockerHost: '192.0.0.1'
        }
      };
      var res = {};
      containerFs.parseParams(req, res, function () {
        expect(req.params.path).to.equal('/api/.git/refs/');
        done();
      });
    });
  });
  describe('#parseBody', function () {
    it('should parse pathname correctly for dir', function (done) {
      var req = {
        body: {
          isDir: true,
          name: 'hellonode',
          path: '/'
        },
        params: {}
      };
      var res = {};
      containerFs.parseBody(req, res, function () {
        expect(req.params.path).to.equal('/hellonode/');
        expect(req.params.content).to.equal('');
        expect(req.params.isDir).to.equal(true);
        done();
      });
    });
    it('should parse pathname correctly for nested dir', function (done) {
      var req = {
        body: {
          isDir: true,
          name: 'refs',
          path: '/api/.git'
        },
        params: {}
      };
      var res = {};
      containerFs.parseBody(req, res, function () {
        expect(req.params.path).to.equal('/api/.git/refs/');
        expect(req.params.content).to.equal('');
        expect(req.params.isDir).to.equal(true);
        done();
      });
    });
    it('should parse pathname correctly for file', function (done) {
      var req = {
        body: {
          isDir: false,
          name: 'hellonode',
          path: '/'
        },
        params: {}
      };
      var res = {};
      containerFs.parseBody(req, res, function () {
        expect(req.params.path).to.equal('/hellonode');
        expect(req.params.content).to.equal('');
        expect(req.params.isDir).to.equal(false);
        done();
      });
    });
  });

  describe('#handlePatch', function () {

    it('should take all the data from req.params', function (done) {
      var req = {
        params: {
          container: 'container-id',
          path: '/root',
          newPath: '/root-id',
          content: 'some data'
        }
      };
      var stub = sinon.stub(containerFsAPI, 'patch');
      stub.restore();
      done();
    });
  });
});
