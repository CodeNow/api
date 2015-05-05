'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var containerFs = require('middlewares/apis/container-fs');

describe('container-fs', function () {
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
});
