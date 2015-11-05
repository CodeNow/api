'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var NaviEntry = require('models/mongo/navi-entry');

var ctx = {};
var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('Navi Entry: '+moduleName, function () {
  describe('createOrUpdateNaviInstanceEntry', function () {
    beforeEach(function (done) {
      ctx.mockInstance = {
        id: sinon.stub().returns('instanceID'),
        getElasticHostname: sinon.stub().returns('elasticHostname.example.com'),
        getDirectHostname: sinon.stub().returns('directHostname.example.com'),
        getMainBranchName: sinon.stub().returns('branchName'),
        getDependencies: sinon.stub().yieldsAsync(null, [{dep:1}]),
        owner: {
          github: 1234,
          username: 'Myztiq'
        },
        masterPod: true
      };
      done();
    });

    describe('masterPod Instance', function (){
      beforeEach(function (done) {
        ctx.mockInstance.masterPod = true
        sinon.stub(NaviEntry.prototype, 'save');
        done();
      });
      afterEach(function (done) {
        NaviEntry.prototype.save.restore();
        done();
      });
      describe('db success', function () {
        beforeEach(function (done) {
          NaviEntry.prototype.save.yieldsAsync();
          done();
        });
        it('should create a navi entry', function (done) {
          NaviEntry.createOrUpdateNaviInstanceEntry(ctx.mockInstance, function cb (err) {
            if (err) { return done(err); }
            sinon.assert.calledOnce(ctx.mockInstance.getElasticHostname);
            sinon.assert.calledOnce(ctx.mockInstance.getDirectHostname);
            sinon.assert.calledOnce(ctx.mockInstance.getMainBranchName);
            sinon.assert.calledOnce(ctx.mockInstance.getDependencies);
            sinon.assert.calledWith(NaviEntry.prototype.save, cb);
            var naviEntryValue = NaviEntry.prototype.save.lastCall.thisValue;
            expect(naviEntryValue.elasticUrl, 'elastic URL').to.equal('elasticHostname.example.com');
            expect(naviEntryValue.ownerGithubId, 'ownerGithubId').to.equal(1234);
            expect(naviEntryValue.directUrls['instanceID'], 'DirectUrls').to.deep.equal({
              branch: 'branchName',
              url: 'directHostname.example.com',
              associations: [{dep: 1}]
            });
            done();
          });
        });
      });
      describe('db err', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          NaviEntry.prototype.save.yieldsAsync(ctx.err);
          done();
        });
        it('should callback err if db errs', function (done) {
          NaviEntry.createOrUpdateNaviInstanceEntry(ctx.mockInstance, function (err) {
            expect(err).to.equal(ctx.err);
            done();
          });
        });
      });
    });
  });
});