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
  beforeEach(function (done) {
    ctx.mockInstance = {
      shortHash: 'instanceID',
      getElasticHostname: sinon.stub().returns('elasticHostname.example.com'),
      getDirectHostname: sinon.stub().returns('directHostname.example.com'),
      getMainBranchName: sinon.stub().returns('branchName'),
      getDependencies: sinon.stub().yieldsAsync(null, [{dep:1}]),
      owner: {
        github: 1234,
        username: 'Myztiq'
      },
      masterPod: true,
      status: sinon.stub().yieldsAsync(null, 'running')
    };
    done();
  });
  describe('handleNewInstance', function () {
    describe('masterPod Instance', function (){
      beforeEach(function (done) {
        ctx.mockInstance.masterPod = true;
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
          NaviEntry.handleNewInstance(ctx.mockInstance, function (err) {
            if (err) { return done(err); }
            sinon.assert.calledOnce(ctx.mockInstance.getElasticHostname);
            sinon.assert.calledOnce(ctx.mockInstance.getDirectHostname);
            sinon.assert.calledOnce(ctx.mockInstance.getMainBranchName);
            sinon.assert.calledOnce(ctx.mockInstance.getDependencies);
            sinon.assert.calledOnce(NaviEntry.prototype.save);
            var naviEntryValue = NaviEntry.prototype.save.lastCall.thisValue;
            expect(naviEntryValue.elasticUrl, 'elastic URL').to.equal('elasticHostname.example.com');
            expect(naviEntryValue.ownerGithubId, 'ownerGithubId').to.equal(1234);
            expect(naviEntryValue.directUrls.instanceID, 'DirectUrls').to.deep.equal({
              branch: 'branchName',
              url: 'directHostname.example.com',
              dependencies: [{dep: 1}]
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
          NaviEntry.handleNewInstance(ctx.mockInstance, function (err) {
            expect(err).to.equal(ctx.err);
            done();
          });
        });
      });
    });
    describe('masterPod Instance', function (){
      beforeEach(function (done) {
        ctx.mockInstance.masterPod = false;
        sinon.stub(NaviEntry, 'findOneAndUpdate');
        done();
      });
      afterEach(function (done) {
        NaviEntry.findOneAndUpdate.restore();
        done();
      });
      describe('db success', function () {
        beforeEach(function (done) {
          NaviEntry.findOneAndUpdate.yieldsAsync();
          done();
        });
        it('should create a navi entry', function (done) {
          NaviEntry.handleNewInstance(ctx.mockInstance, function (err) {
            if (err) { return done(err); }
            sinon.assert.calledWith(
              NaviEntry.findOneAndUpdate,
              {
                'direct-urls.instanceID': {$exists: true}
              }, {
                $set: {
                  'direct-urls.instanceID': {
                    branch: 'branchName',
                    url: 'directHostname.example.com',
                    dependencies: [{dep: 1}]
                  }
                }
              }
            );
            done();
          });
        });
      });
      describe('db err', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          NaviEntry.findOneAndUpdate.yieldsAsync(ctx.err);
          done();
        });
        it('should callback err if db errs', function (done) {
          NaviEntry.handleNewInstance(ctx.mockInstance, function (err) {
            expect(err).to.equal(ctx.err);
            done();
          });
        });
      });
    });
  });
  describe('handleInstanceStatusChange', function () {
    beforeEach(function (done) {
      sinon.stub(NaviEntry, 'findOneAndUpdate').yieldsAsync(null);
      done();
    });
    afterEach(function (done) {
      NaviEntry.findOneAndUpdate.restore();
      done();
    });

    describe('db err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        NaviEntry.findOneAndUpdate.yieldsAsync(ctx.err);
        done();
      });
      it('should callback err if db errs', function (done) {
        NaviEntry.handleInstanceStatusChange(ctx.mockInstance, function (err) {
          expect(err).to.equal(ctx.err);
          done();
        });
      });
    });

    describe('running', function (){
      beforeEach(function (done) {
        ctx.mockInstance.status.yieldsAsync(null, 'running');
        ctx.mockInstance.container = {
          dockerHost: '10.0.0.1',
          ports: [80, 3000]
        };
        done();
      });
      it('should update the database', function (done) {
        NaviEntry.handleInstanceStatusChange(ctx.mockInstance, function (err) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            NaviEntry.findOneAndUpdate,
            {
              'direct-urls.instanceID': {$exists: true}
            }, {
              $set: {
                'direct-urls.instanceID.ports': ctx.mockInstance.container.ports,
                'direct-urls.instanceID.dockerHost': ctx.mockInstance.container.dockerHost,
                'direct-urls.instanceID.status': 'running'
              }
            }
          );
          done();
        });
      });
    });
    describe('crashed', function () {
      beforeEach(function (done) {
        ctx.mockInstance.status.yieldsAsync(null, 'crashed');
        ctx.mockInstance.container = null;
        done();
      });
      it('should update the database', function (done) {
        NaviEntry.handleInstanceStatusChange(ctx.mockInstance, function (err) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            NaviEntry.findOneAndUpdate,
            {
              'direct-urls.instanceID': {$exists: true}
            }, {
              $set: {
                'direct-urls.instanceID.ports': null,
                'direct-urls.instanceID.dockerHost': null,
                'direct-urls.instanceID.status': 'crashed'
              }
            }
          );
          done();
        });
      });
    });
  });
  describe('_getDirectURlObj', function (){
    it('should handle error fetching dependencies', function (done) {
      var err = new Error('Hello!');
      ctx.mockInstance.getDependencies.yieldsAsync(err);

      NaviEntry._getDirectURlObj(ctx.mockInstance, function (returnedError, data){
        expect(data).to.not.exist();
        expect(returnedError).to.equal(err);
        done();
      });
    });
    it('should return the direct url object', function (done) {
      NaviEntry._getDirectURlObj(ctx.mockInstance, function (err, data){
        sinon.assert.calledOnce(ctx.mockInstance.getDependencies);
        expect(err).to.not.exist();
        expect(data).to.deep.equal({
          branch: 'branchName',
          url: 'directHostname.example.com',
          dependencies: [{dep: 1}]
        });
        done();
      });
    });
  });
});