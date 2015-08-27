'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var rabbitMQ = require('../../../lib/models/rabbitmq/index.js');
var Github = require('../../../lib/models/apis/github.js');
var Shiva = require('../../../lib/models/apis/shiva.js');

var request = require('request');
var createCount = require('callback-count');
var sinon = require('sinon');
var Boom = require('dat-middleware').Boom;

describe('lib/models/apis/shiva.js unit test', function () {
  var testReq = {
    name: 'nemo'
  };
  beforeEach(function (done) {
    sinon.stub(Github.prototype, 'getUserByUsername');
    sinon.stub(rabbitMQ, 'publishOrgWhitelisted');
    done();
  });

  afterEach(function (done) {
    Github.prototype.getUserByUsername.restore();
    rabbitMQ.publishOrgWhitelisted.restore();
    done();
  });

  describe('getUserByUsername errs', function() {
    it('should return error', function(done) {
      var testErr = new Error('ice storm');
      Github.prototype.getUserByUsername.yieldsAsync(testErr);
      Shiva.publishOrgWhitelistedMw(testReq, {}, function (err) {
        expect(err).to.deep.equal(testErr);
        done();
      });
    });
    it('should return badRequest', function(done) {
      Github.prototype.getUserByUsername.yieldsAsync(null, null);
      Shiva.publishOrgWhitelistedMw(testReq, {}, function (err) {
        expect(err.output.statusCode).to.equal(400);
        done();
      });
    });
  }); // end getUserByUsername errs
  describe('getUserByUsername successful', function() {
    var testId = 24182934;
    var testData = {
      id: testId
    };
    beforeEach(function(done) {
      Github.prototype.getUserByUsername.yieldsAsync(null, testData);
      done();
    });
    it('should publish job', function(done) {
      Shiva.publishOrgWhitelistedMw(testReq, {}, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.publishOrgWhitelisted
          .withArgs({
            orgId: testId
          }).called).to.be.true();
        done();
      });
    });
  }); // end getUserByUsername successful
});
