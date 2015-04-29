/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create/post/201
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var createCount = require('callback-count');
var sinon = require('sinon');

//var Runnable = require('models/apis/runnable');
var api = require('../../../fixtures/api-control');
var dock = require('../../../fixtures/dock');
var expects = require('../../../fixtures/expects');
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

//var runnable = new Runnable({}, {});

var ctx = {};
describe('201 POST /workers/container-create', function () {

  // before
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

  beforeEach(function (done) {
    // need instance
    multi.createInstance(function (instance) {
      ctx.instance = instance;
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
});

  it('should upate instance with container information', function (done) {
    return done();
    runnable.workerContainerCreate({}, function () {
      console.log(arguments);
      done();
    });
  });
/*
  it('should deploy/start the container', function (done) {
    done();
  });
*/
});
