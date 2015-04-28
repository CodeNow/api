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

    /* TJ comments */
    // create an instance ^^ you have that taken care of.
    //   BUT the multifactory methods may not be reliable anymore
    //   as they expect the POST/PATCH instance w/ {build:builtBuildId}
    //   to respond after the container has actually been created.
    // for this test it may not matter though. lets try this:
    //   * use the instance above
    //   * create a container using the docker model (note if you provide labels
    //      to this container docker-listener may create the container-create job,
    //      and it may actually reach the api-server and call this route for you).
    //   * if you want to call the route manually just create a container without labels
    //      use that information to create an accurate 'body' to post to this route and
    //      add the labels to the body (so it the route can use them to query the instance)
    //   * finally, assert properties the response body
  });
  it('should upate instance with container information', function (done) {
    done();
  });
  it('should deploy/start the container', function (done) {
    done();
  });
});
