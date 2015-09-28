'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;

var expect = require('code').expect;
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var createCount = require('callback-count');

describe('Dependencies - /instances/:id/dependencies', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('User Instances', function () {

    beforeEach(function (done) {
      multi.createAndTailInstance(primus, function (err, instance, build, user) {
        //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build;
        ctx.user = user;
        done();
      });
    });

    describe('Instance has a env dependency', function() {
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.elasticHostname = ctx.instance.getElasticHostname();
        // setting name and masterPod here emulates an auto-forked instance
        var branch = ctx.instance.attrs.contextVersion.appCodeVersions[0].branch;
        var body2 = {
          name: branch+'-'+ctx.instance.attrs.name,
          build: ctx.build.id(),
          masterPod: false
        };
        var depBody = {
          env: [
            'other='+ctx.elasticHostname
          ],
          build: ctx.build.id()
        };
        primus.expectActionCount('start', 2, count.inc().next);
        ctx.instance2 = ctx.user.createInstance(body2, count.inc().next);
        ctx.instanceWithDep = ctx.user.createInstance(depBody, count.inc().next);
      });

      it('should return 404 if instance not found', function (done) {
        var deps = ctx.instanceWithDep.fetchDependencies(function (err, data) {
          if (err) { return done(err); }
          expectInstanceDep(data, ctx.instance);
          deps.models[0].update({
            hostname: ctx.elasticHostname,
            instance: '123456789012345678901234'
          }, function (err) {
            expect(err).to.exist();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/instance/i);
            ctx.instanceWithDep.fetchDependencies(function (err, data) {
              if (err) { return done(err); }
              expectInstanceDep(data, ctx.instance);
              done();
            });
          });
        });
      });

      it('should return 404 if existing dep w/ hostname not found', function (done) {
        var deps = ctx.instanceWithDep.fetchDependencies(function (err, data) {
          if (err) { return done(err); }
          expectInstanceDep(data, ctx.instance);
          deps.models[0].update({
            hostname: 'blah-'+ctx.elasticHostname,
            instance: ctx.instance2.attrs.shortHash
          }, function (err) {
            expect(err).to.exist();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/dependency/i);
            ctx.instanceWithDep.fetchDependencies(function (err, data) {
              if (err) { return done(err); }
              expectInstanceDep(data, ctx.instance);
              done();
            });
          });
        });
      });
    });
  });
});

function expectInstanceDep (data, expectedInstance) {
  expect(data).to.be.an.array();
  expect(data).to.have.a.length(1);
  expect(data[0]).to.deep.contain({
    id:        expectedInstance.attrs._id.toString(),
    shortHash: expectedInstance.attrs.shortHash.toString(),
    lowerName: expectedInstance.attrs.lowerName,
    name:      expectedInstance.attrs.name,
    // hostname:  expectedInstance.getElasticHostname().toLowerCase(),
    owner: { github: expectedInstance.attrs.owner.github },
    contextVersion: { context: expectedInstance.attrs.contextVersion.context.toString() }
  });
}
