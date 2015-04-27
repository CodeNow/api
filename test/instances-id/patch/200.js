/**
 * @module test/instances-id/patch/200
 */
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
var sinon = require('sinon');

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');

describe('202 PATCH /instances', function () {
  var ctx = {};
  // before
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);
  // afterEach(require('../../fixtures/clean-mongo').removeEverything);
  // afterEach(require('../../fixtures/clean-ctx')(ctx));
  // afterEach(require('../../fixtures/clean-nock'));

  describe('For User', function () {
    beforeEach(function (done) {
      multi.createInstance(function (err, instance) {
        if (err) { throw err; }
        ctx.instance = instance;
        done();
      });
    });
    describe('with in-progress build', function () {
      beforeEach(function (done) {
        ctx.createUserContainerSpy = sinon.spy(require('models/apis/docker').prototype, 'createUserContainer');
        multi.createContextVersion(function (err,  cv, context, build, user) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.build = build;
          ctx.cv = cv;
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
      afterEach(function (done) {
        // TODO: wait for event first, make sure everything finishes.. then drop db
        ctx.createUserContainerSpy.restore();
        require('../../fixtures/clean-mongo').removeEverything(done);
        //done();
      });

      it('should create an instance with a build', function (done) {
        var container = {
          dockerHost: 'http://10.10.10.10:4444',
          dockerContainer: ''
        };
        // required when updating container in PATCH route
        var contextVersion = {
           //?? string?
        };
        ctx.instance.update({
          build: ctx.build.id(),
          container: container,
          contextVersion: contextVersion // <-- query string?
        }, function (err, body, statusCode) {
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          done();
        });
      });
    });
  });
});

function expectInstanceCreated (body, statusCode, user, build, cv) {
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
  expect(body.network).to.exist();
  expect(body.network.networkIp).to.exist();
  expect(body.network.hostIp).to.exist();
  expect(body.name).to.exist();
  expect(body.lowerName).to.equal(body.name.toLowerCase());

  expect(body).deep.contain({
    build: build,
    contextVersion: cv,
    contextVersions: [ cv ], // legacy support for now
    owner: owner,
    containers: [ ],
    autoForked: false,
    masterPod : false
  });
}










/*
      it('should create an instance with name, build, env', function (done) {
        var name = 'CustomName';
        var env = ['one=one','two=two','three=three'];
        ctx.user.createInstance({ build: ctx.build.id(), name: name, env: env }, function (err, body, statusCode) {
          if (err) { return done(err); }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          done();
        });
      });
    });
    describe('with built build', function () {
      beforeEach(function (done) {
        ctx.createUserContainerSpy = sinon.spy(require('models/apis/docker').prototype, 'createUserContainer');
        multi.createBuiltBuild(function (err, build, user, models) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.build = build;
          ctx.cv = models[0];
          done();
        });
      });
      afterEach(function (done) {
        // TODO: wait for event first, make sure everything finishes.. then drop db
        // instance "deployed"onceInstanceUpdate
        ctx.createUserContainerSpy.restore();
        done();
      });

      it('should create an instance with a build', function (done) {
        ctx.user.createInstance({ build: ctx.build.id() }, function (err, body, statusCode) {
          if (err) { return done(err); }
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          expect(ctx.createUserContainerSpy.calledOnce).to.be.true();
          expect(ctx.createUserContainerSpy.args[0][1]).to.deep.equal({
            Env: [],
            Labels: {
              instanceId: body._id,
              instanceName: body.name,
              contextVersionId: ctx.cv.id(),
              ownerUsername: ctx.user.attrs.accounts.github.login
            }
          });
          done();
        });
      });

      it('should create an instance with a name, build, env', function (done) {
        var name = 'CustomName';
        var env = ['one=one','two=two','three=three'];
        ctx.user.createInstance({ build: ctx.build.id(), name: name, env: env }, function (err, body, statusCode) {
          if (err) { return done(err); }
          expect(body.name).to.equal(name);
          expect(body.env).to.deep.equal(env);
          expectInstanceCreated(body, statusCode, ctx.user, ctx.build, ctx.cv);
          done();
        });
      });
    });
  });
});
*/
