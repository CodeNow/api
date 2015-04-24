/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var createCount = require('callback-count');
var sinon = require('sinon');

var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('201 POST /workers/container-create', function () {
  var ctx = {};
  beforeEach(function (done) {
    var count = createCount(3, done);
    // need instance
    multi.createInstance(function (instance) {
      ctx.instance = instance;
      count.inc();
    });
    // fake container info
    // dockerode method spies for assertion
  });
  it('should upate instance with container information', function (done) {
    done();
  });
  it('should deploy/start the container', function (done) {
    done();
  });
});
