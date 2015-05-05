/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create/post/201
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var async = require('async');
var sinon = require('sinon');

var Instance = require('models/mongo/instance');
var api = require('../../../fixtures/api-control');
var containerInspectFixture = require('../../../fixtures/container-inspect');
var dock = require('../../../fixtures/dock');
//var expects = require('../../../fixtures/expects');
var multi = require('../../../fixtures/multi-factory');
var primus = require('../../../fixtures/primus');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var containerInspect;
var ctx = {};
var originalContainCreateWorker;

describe('201 POST /workers/container-create', function () {

  // before
  before(function (done) {
    /**
     * monkey patch contain-create worker callback
     * Note: This is just-shy of a full BDD test isn't it? If we didn't prevent the worker
     * process from running and tested the instance for containers, this would be an BDD test.
     */
    originalContainCreateWorker = require('workers/container-create').worker;
    require('workers/container-create').worker = function (data, ack) {
      ack();
    };
    done();
  });
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  //before(require('../../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  //after(require('../../../fixtures/mocks/api-client').clean);
  afterEach(require('../../../fixtures/clean-mongo').removeEverything);
  after(function (done) {
    require('workers/container-create').worker = originalContainCreateWorker;
    done();
  });

  beforeEach(function (done) {
    // need instance

    multi.createInstance(function (err, instance) {
      if (err) { return done(err); }
      // poll for worker to complete update
      ctx.instance = instance;
      containerInspect = containerInspectFixture.getContainerInspect(instance);
      done();
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
    //
    // Casey Notes / Ideas
    //   - Race condition in the test following the above proposal that wouldn't occur normally
    //     - POST instances/ - creates container, docker-listener creates job to modify instance
    //       - (1) job calls worker route (updates instance /w container)
    //     - (2) Test calls worker route (updates instance w/ container)
    //     - Order could occur as 2, then 1
    //  Possible race fix, wait for worker to recieve job & update instance, then have test call worker route
    //  Alternatively, we can disable docker-listener for these tests
    //
    //  ^ All of that sucks. Lets just spy on the runnable model methods and assert they were invoked correctly
    //
    //  Or we deregister (stop consuming) container-create jobs.
    //  Job remains in queue, effectively ignored
    //  We invoke worker route with simulated body, verify correct
  });

  it('should upate instance with container information', function (done) {
    // this is essentially all the worker callback does, invoke this method
    // containerInspect is sample data collected from actual docker-listener created job
    async.series([
      function (cb) {
        //assert instance has no container
        Instance.findById(ctx.instance.attrs._id, function (err, instance) {
          expect(instance.container).to.be.undefined();
          cb();
        });
      },
      function (cb) {
        originalContainCreateWorker(containerInspect, function () {
          cb();
        });
        /*
        runnable.workerContainerCreate({
          json: containerInspect,
        }, function (err, res, body) {
          expect(res.statusCode).to.equal(200);
          cb();
        });
        */
      },
      function (cb) {
        //assert instance has no container
        Instance.findById(ctx.instance.attrs._id, function (err, instance) {
          expect(instance.container).to.be.an.object();
          expect(instance.container.inspect).to.be.an.object();
          expect(instance.container.dockerContainer).to.be.a.string();
          expect(instance.container.dockerHost).to.be.a.string();
          cb();
        });
      }
    ], done);
  });

  //it('should start the container', function (done) {
  //  done();
  //});
});
