'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var it = lab.it;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');

var Code = require('code');
var expect = Code.expect;

var typesTests = require('../../fixtures/types-test-util');

describe('400 POST /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createBuild(function (err, build, context, user) {
        ctx.build = build;
        ctx.context = context;
        ctx.user = user;
        done(err);
      });
    });

    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArr) {
        if (err) { return done(err); }
        ctx.build = build;
        ctx.user = user;
        ctx.context = modelArr[1];
        ctx.infraCodeVersionId = modelArr[0].json().infraCodeVersion;
        done();
      });
    });

    var def = {
      action: 'create versions',
      optionalParams: [
        {
          name: 'infraCodeVersion',
          type: 'ObjectId'
        },
      ]
    };

    typesTests.makeTestFromDef(def, ctx, lab, function(body, cb) {
      ctx.context.createVersion(body, cb);
    });


  });

  describe('Rollback', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArr) {
        ctx.build = build;
        ctx.user = user;
        ctx.contextVersion = modelArr[0];
        ctx.context = modelArr[1];
        done();
      });
    });
    beforeEach(function (done) {
      ctx.build1 = ctx.build.deepCopy(function () {
        ctx.advancedCv = ctx.build1.contextVersions.models[0];
        ctx.advancedCv.update({advanced: true}, function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          multi.buildTheBuild(ctx.user, ctx.build1, done);
        });
      });
    });
    beforeEach(function (done) {
      ctx.build2 = ctx.build1.deepCopy(function () {
        ctx.newestCv = ctx.build2.contextVersions.models[0];
        ctx.newestCv.update({advanced: false}, function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          multi.buildTheBuild(ctx.user, ctx.build2, done);
        });
      });
    });
    it('should rollback to the very first cv', function (done) {
      var rollback = ctx.advancedCv.rollback(function (err, body, statusCode) {
        if (err) {
          return done(err);
        }
        expect(statusCode).to.equal(200);
        expect(rollback.attrs._id).to.equal(ctx.contextVersion.attrs._id);
        done();
      });
    });
    it('should rollback to nothing if there is nothing to rollback to', function (done) {
      var rollback = ctx.contextVersion.rollback(function (err, body, statusCode) {
        if (err) {
          return done(err);
        }
        expect(statusCode).to.equal(200);
        expect(rollback).to.not.be.ok;
        done();
      });
    });
    it('should rollback to the newestCv after updating again to advanced', function (done) {
      ctx.build3 = ctx.build2.deepCopy(function () {
        var advancedCv = ctx.build3.contextVersions.models[0];
        advancedCv.update({advanced: true}, function (err) {
          if (err) {
            return done(err);
          }
          multi.buildTheBuild(ctx.user, ctx.build3, function () {
            var rolledBack = advancedCv.rollback(function (err, body, statusCode) {
              if (err) {
                return done(err);
              }
              expect(statusCode).to.equal(200);
              var build2Cv = ctx.build2.contextVersions.models[0];
              expect(rolledBack.attrs._id).to.not.equal(advancedCv.attrs._id);
              expect(rolledBack.attrs._id).to.equal(build2Cv.attrs._id);
              done();
            });
          });
        });
      });
    });
  });
});
