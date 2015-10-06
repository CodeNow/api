/**
 * @module unit/middlewares/owner-is-hello-runnable
 */
'use strict';

require('loadenv')();

var noop = require('101/noop');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var sinon = require('sinon');
var assertHttps = require('middlewares/assert-https');

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('is https unit test: '+moduleName, function () {

  it('should next no error we NODE_ENV is test', function(done) {
    var req = {
      headers: {
        'x-forwarded-protocol': 'http'
      }
    };
    assertHttps(req, {}, function (err) {
      expect(err).to.not.exist();
      done();
    });
  });

  describe('non-test env', function () {
    beforeEach(function (done) {
      process.env.NODE_ENV = 'development';
      done();
    });
    afterEach(function (done) {
      process.env.NODE_ENV = 'test';
      done();
    });
    it('should next no error if protocol was https', function(done) {
      var req = {
        headers: {
          'x-forwarded-protocol': 'https'
        }
      };
      assertHttps(req, {}, function (err) {
        expect(err).to.not.exist();
        done();
      });
    });
    it('should next error if protocol was https', function(done) {
      var req = {
        headers: {
          'x-forwarded-protocol': 'http'
        }
      };
      var res = {
        status: noop,
        send: noop
      };
      sinon.stub(res, 'status');
      sinon.stub(res, 'send');
      assertHttps(req, res, function () {
        done(new Error('Next should never be called'));
      });
      expect(res.status.callCount).to.equal(1);
      expect(res.status.getCall(0).args[0]).to.equal(403);
      expect(res.send.getCall(0).args[0]).to.equal('We do not support http, use https');
      done();
    });
  });

});
