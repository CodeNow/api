/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create/post/201
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var async = require('async');
var createCount = require('callback-count');
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
    originalContainCreateWorker = require('workers/container-create').worker;
    require('workers/container-create').worker = function (data, ack) {
      ack();
    };
    done();
  });
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../../fixtures/mocks/api-client').clean);
  //after(require('../../../fixtures/clean-mongo').removeEverything);
  // afterEach(require('../../fixtures/clean-nock'));
  after(function (done) {
    require('workers/container-create').worker = originalContainCreateWorker;
    done();
  });

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      // poll for worker to complete update
      ctx.instance = instance;
      ctx.user = user;
      done();
    });
  });
  beforeEach(function(done){
    primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
  });
  beforeEach(function(done){
    containerInspect = containerInspectFixture.getContainerInspect(ctx.instance);
    done();
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
        var count = createCount(cb);
        primus.expectAction('deploy', {}, count.inc().next);
        originalContainCreateWorker(containerInspect, count.inc().next);
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

