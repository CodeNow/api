/**
 * @module test/instances-id/patch/200
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var Docker = require('dockerode');

var api = require('../../fixtures/api-control');
var createCount = require('callback-count');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var dockerMockEvents = require('../../fixtures/docker-mock-events');

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var sinon = require('sinon');
var rabbitMQ = require('models/rabbitmq');
var InstanceService = require('models/services/instance-service');

function expectInstanceUpdated (body, statusCode, user, build, cv, container) {
  user = user.json();
  build = build.json();
  cv = cv.json();
  var owner = {
    github:   user.accounts.github.id,
    username: user.accounts.github.login,
    gravatar: user.gravatar

  };
  expect(body._id).to.exist();
  expect(body.shortHash).to.exist();
  expect(body.name).to.exist();
  expect(body.lowerName).to.equal(body.name.toLowerCase());
  var deepContain = {
    build: build,
    contextVersion: cv,
    contextVersions: [ cv ], // legacy support for now
    owner: owner,
    containers: [ ],
    autoForked: false,
    masterPod : false
  };
  if (container) {
    delete deepContain.containers;
    expect(body.containers[0].inspect.Id).to.equal(container.Id);
    expect(body.containers[0].dockerHost).to.equal('http://127.0.0.1:4243');
    expect(body.containers[0].dockerContainer).to.equal(container.Id);
  }
  expect(body).deep.contain(deepContain);
}

describe('200 PATCH /instances', function () {
  var ctx = {};
  var docker;
  // before
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);

  before(function (done) {
    // container to update test w/ later
    docker = ctx.docker = new Docker({
      host: 'localhost',
      port: 4243
    });
    done();
  });
  before(function (done) {
    // prevent worker to be created
    sinon.stub(rabbitMQ, 'deleteInstance', function () {});
    sinon.stub(rabbitMQ, 'deployInstance', function () {});
    done();
  });

  after(function (done) {
    rabbitMQ.deleteInstance.restore();
    rabbitMQ.deployInstance.restore();
    done();
  });
  beforeEach(function (done) {
    docker.createContainer({
      Image: 'ubuntu',
      Cmd: ['/bin/bash'],
      name: 'fight-frustration'
    }, function (err, container) {
      if (err) { return done(err); }
      container.inspect(function (err, data) {
        if (err) { return done(err); }
        ctx.container = data;
        done();
      });
    });
  });

  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('For User', function () {
    describe('with in-progress build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, cv, context, build, user) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.cv = cv;
          ctx.user = user;
          done();
        });
      });
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, done);
      });
      beforeEach(function (done) {
        ctx.build.build(function (err) {
          if (err) { return done(err); }
          ctx.cv.fetch(done); // used in assertions
        });
      });
      beforeEach(function (done) {
        // create instance
        ctx.instance = ctx.user.createInstance({
          json: {
            build: ctx.build.id()
          }
        }, function (err) {
          done(err);
        });
      });
      afterEach(function (done) {
        require('../../fixtures/clean-mongo').removeEverything(done);
      });

      it('should update an instance with a build', function (done) {
        var count = createCount(2, done);
        sinon.spy(InstanceService.prototype, 'deleteForkedInstancesByRepoAndBranch');
        // Original patch from the update route, then the one at the end of the on-build-die
        primus.expectActionCount('patch', 2, function () {
          expect(InstanceService.prototype.deleteForkedInstancesByRepoAndBranch.callCount).to.equal(1);
          var acv = ctx.cv.appCodeVersions.models[0].attrs;
          var args = InstanceService.prototype.deleteForkedInstancesByRepoAndBranch.getCall(0).args;
          expect(args[0].toString()).to.equal(ctx.instance.id().toString());
          expect(args[1]).to.equal(ctx.user.id());
          expect(args[2]).to.equal(acv.lowerRepo);
          expect(args[3]).to.equal(acv.lowerBranch);
          InstanceService.prototype.deleteForkedInstancesByRepoAndBranch.restore();
          count.next();
        });
        ctx.instance.update({
          env: ['ENV=OLD'],
          build: ctx.build.id()
        }, function (err, body, statusCode) {
          expectInstanceUpdated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          // wait until build is ready to finish the test
          primus.onceVersionComplete(ctx.cv.id(), function () {
            count.next();
          });
          dockerMockEvents.emitBuildComplete(ctx.cv);
        });
      });

      it('should update an instance with name, build, env', function (done) {
        var count = createCount(2, done);
        var name = 'CustomName';
        var env = ['one=one','two=two','three=three'];
        // Original patch from the update route, then the one at the end of the on-build-die
        primus.expectActionCount('patch', 2, count.next);
        ctx.instance.update({
          build: ctx.build.id(),
          name: name,
          env: env
        }, function (err, body, statusCode) {
          if (err) { return done(err); }
          expectInstanceUpdated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          // wait until build is ready to finish the test

          primus.onceVersionComplete(ctx.cv.id(), function () {
            count.next();
          });
          dockerMockEvents.emitBuildComplete(ctx.cv);
        });
      });

      it('should update an instance with a container and context version', function (done) {
        var count = createCount(2, done);
        var container = {
          dockerHost: 'http://127.0.0.1:4243',
          dockerContainer: ctx.container.Id
        };
        // Original patch from the update route, then the one at the end of the on-build-die
        primus.expectActionCount('patch', 2, count.next);
        // required when updating container in PATCH route
        var contextVersion = ctx.cv.id();
        var opts = {
          json: {
            container: container
          },
          qs: {
            'contextVersion._id': contextVersion
          }
        };

        ctx.instance.update(opts, function (err, body, statusCode) {
          expectInstanceUpdated(body, statusCode, ctx.user, ctx.build, ctx.cv, ctx.container);
          // wait until build is ready to finish the test
          primus.onceVersionComplete(ctx.cv.id(), function () {
            count.next();
          });
          dockerMockEvents.emitBuildComplete(ctx.cv);
        });
      });
    });
  });
});
