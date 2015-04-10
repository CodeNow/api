/**
 * @module test/autoforking
 */
'use strict';

var Code = require('code');
var Lab = require('lab');

var Instance = require('models/mongo/instance');
var Runnable = require('models/apis/runnable');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var primus = require('./fixtures/primus');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('Autoforking', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.orgId = 1001;
    multi.createInstance(ctx.orgId, function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.user = user;
      ctx.build = build;
      done();
    });
  });

  describe('Instances#findMasterInstances', function () {
    it('should return empty [] for repo that has no instances', function (done) {
      Instance.findMasterInstances('anton/node', function (err, instances) {
        expect(err).to.be.null();
        expect(instances.length).to.equal(0);
        done();
      });
    });

    it('should return empty [] for repo that has no instances', function (done) {
      var repo = ctx.instance.attrs.contextVersion.appCodeVersions[0].repo;
      Instance.findMasterInstances(repo, function (err, instances) {
        expect(err).to.be.null();
        expect(instances.length).to.equal(0);
        done();
      });
    });

    it('should return array with instance that has masterPod=true', function (done) {
      var repo = ctx.instance.attrs.contextVersion.appCodeVersions[0].repo;
      ctx.instance.setInMasterPod({ masterPod: true }, function (err) {
        expect(err).to.be.null();
        Instance.findMasterInstances(repo, function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(1);
          expect(instances[0].shortHash).to.equal(ctx.instance.attrs.shortHash);
          done();
        });
      });
    });

    it('should return array with 2 instances that has masterPod=true', function (done) {
      var repo = ctx.instance.attrs.contextVersion.appCodeVersions[0].repo;
      ctx.user.copyInstance(ctx.instance.id(), {}, function (err, copiedInstance) {
        expect(err).to.be.null();
        ctx.instance.setInMasterPod({ masterPod: true }, function (err) {
          expect(err).to.be.null();
          ctx.user.newInstance(copiedInstance.shortHash).setInMasterPod({ masterPod: true }, function (err) {
            expect(err).to.be.null();
            Instance.findMasterInstances(repo, function (err, instances) {
              expect(err).to.be.null();
              expect(instances.length).to.equal(2);
              var arr = [
                instances[0].shortHash,
                instances[1].shortHash
              ];
              expect(arr).to.only.contain([ctx.instance.attrs.shortHash, copiedInstance.shortHash]);
              done();
            });
          });
        });
      });
    });
  });

  describe('fork master instance', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001;
      multi.createInstance(ctx.orgId, function (err, instance, build, user) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.user = user;
        ctx.build = build;
        done();
      });
    });

    it('should create new instance forked instance', function (done) {
      var runnable = new Runnable({}, ctx.user.attrs);
      runnable.forkMasterInstance(ctx.instance.attrs, ctx.build.attrs._id, 'feat-1', function (err, instance) {
        expect(err).to.be.null();
        expect(instance.masterPod).to.be.false();
        expect(instance.autoForked).to.be.true();
        expect(instance.name).to.be.equal(ctx.instance.attrs.name + '-feat-1');
        expect(instance.parent).to.be.equal(ctx.instance.attrs.shortHash);
        expect(instance.createdBy.github).to.be.equal(ctx.user.attrs.accounts.github.id);
        done();
      });
    });

    it('should create multiple instances for the same branch but append suffix to the name', function (done) {
      var runnable = new Runnable({}, ctx.user.attrs);
      runnable.forkMasterInstance(ctx.instance.attrs, ctx.build.attrs._id, 'feat-1', function (err, instance) {
        expect(err).to.be.null();
        expect(instance.masterPod).to.be.false();
        expect(instance.autoForked).to.be.true();
        expect(instance.name).to.be.equal(ctx.instance.attrs.name + '-feat-1');
        expect(instance.parent).to.be.equal(ctx.instance.attrs.shortHash);
        expect(instance.createdBy.github).to.be.equal(ctx.user.attrs.accounts.github.id);
        runnable.forkMasterInstance(ctx.instance.attrs, ctx.build.attrs._id, 'feat-1', function (err, instance) {
          expect(err).to.be.null();
          expect(instance.masterPod).to.be.false();
          expect(instance.autoForked).to.be.true();
          expect(instance.name).to.be.equal(ctx.instance.attrs.name + '-feat-1-copy');
          expect(instance.parent).to.be.equal(ctx.instance.attrs.shortHash);
          expect(instance.createdBy.github).to.be.equal(ctx.user.attrs.accounts.github.id);
          var repo = ctx.instance.attrs.contextVersion.appCodeVersions[0].repo;
          var branch = ctx.instance.attrs.contextVersion.appCodeVersions[0].branch;
          Instance.findForkedInstances(repo, branch, function (err, forks) {
            expect(err).to.be.null();
            expect(forks.length).to.equal(2);
            var names = [
              ctx.instance.attrs.name + '-feat-1',
              ctx.instance.attrs.name + '-feat-1-copy'
            ];
            expect(names).to.only.include([forks[0].name, forks[1].name]);
            done();
          });
        });
      });
    });

  });

});
