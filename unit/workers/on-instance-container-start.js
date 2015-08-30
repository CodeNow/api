/**
 * @module unit/workers/on-instance-container-start
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var sinon = require('sinon');

var Hosts = require('models/redis/hosts');
var Sauron = require('models/apis/sauron');

var OnInstanceContainerStartWorker = require('workers/on-instance-container-start');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('OnInstanceContainerStartWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.mockInstance = {
      '_id': 'adsfasdfasdfqwfqw cvasdvasDFV',
      name: 'name1',
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      },
      network: {
        hostIp: '0.0.0.0',
        networkIp: '1.1.1.1'
      },
      modifyContainerInspect: function () {}
    };
    ctx.labels = {
      instanceId: ctx.mockInstance._id,
      ownerUsername: 'fifo',
      sessionUserGithubId: 444,
      contextVersionId: 123
    };
    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: ctx.labels
        }
      }
    };
    ctx.worker = new OnInstanceContainerStartWorker(ctx.data);
    done();
  });
  beforeEach(function (done) {
    sinon.stub(ctx.worker, '_findInstance', function (query, cb) {
      ctx.worker.instance = ctx.mockInstance;
      cb(null, ctx.mockInstance);
    });
    sinon.stub(ctx.worker, '_findUser').yieldsAsync();
    sinon.stub(ctx.worker, '_updateInstanceFrontend').yieldsAsync(null);
    done();
  });
  afterEach(function (done) {
    ctx.worker._findInstance.restore();
    ctx.worker._findUser.restore();
    ctx.worker._updateInstanceFrontend.restore();
    done();
  });
  describe('all together', function () {
    beforeEach(function (done) {
      sinon.stub(Sauron.prototype, 'attachHostToContainer').yieldsAsync(null);
      sinon.stub(Hosts.prototype, 'upsertHostsForInstance').yieldsAsync(null);
      done();
    });
    afterEach(function (done) {
      Sauron.prototype.attachHostToContainer.restore();
      Hosts.prototype.upsertHostsForInstance.restore();
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });
      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore();
        done();
      });

      it('should do everything', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.worker._findInstance.callCount).to.equal(1);
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1);
          expect(ctx.mockInstance.modifyContainerInspect.args[0][0])
            .to.equal(ctx.data.id);
          expect(ctx.mockInstance.modifyContainerInspect.args[0][1])
            .to.equal(ctx.data.inspectData);
          expect(Sauron.prototype.attachHostToContainer.callCount).to.equal(1);
          expect(Sauron.prototype.attachHostToContainer.args[0][0])
            .to.equal(ctx.mockInstance.network.networkIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][1])
            .to.equal(ctx.mockInstance.network.hostIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][2]).to.equal(ctx.data.id);
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][0])
              .to.equal(ctx.labels.ownerUsername);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][1]).to.equal(ctx.mockInstance);
          expect(ctx.worker._findUser.callCount).to.equal(1);
          expect(ctx.worker._updateInstanceFrontend.callCount).to.equal(1);
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore();
        done();
      });

      it('should get most of the way through, then fail', function (done) {
        ctx.worker.handle(function (err) {
          expect(err.message).to.equal('this is an error');
          expect(ctx.worker._findInstance.callCount).to.equal(1);
          expect(Sauron.prototype.attachHostToContainer.callCount).to.equal(1);
          expect(Sauron.prototype.attachHostToContainer.args[0][0])
            .to.equal(ctx.mockInstance.network.networkIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][1])
            .to.equal(ctx.mockInstance.network.hostIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][2]).to.equal(ctx.data.id);
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][0])
              .to.equal(ctx.labels.ownerUsername);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][1]).to.equal(ctx.mockInstance);
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1);
          expect(ctx.worker._findUser.callCount).to.equal(1);
          expect(ctx.worker._updateInstanceFrontend.callCount).to.equal(1);
          done();
        });
      });
    });
  });


  describe('_attachContainerToNetwork', function () {
    beforeEach(function (done) {
      // normally set by _findInstance
      ctx.worker.instance = ctx.mockInstance;
      // normally set after _findInstance
      ctx.worker.hostIp = ctx.mockInstance.network.hostIp;
      ctx.worker.networkIp = ctx.mockInstance.network.networkIp;
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Sauron.prototype, 'attachHostToContainer').yieldsAsync(null);
        sinon.stub(Hosts.prototype, 'upsertHostsForInstance').yieldsAsync(null);
        done();
      });

      afterEach(function (done) {
        Sauron.prototype.attachHostToContainer.restore();
        Hosts.prototype.upsertHostsForInstance.restore();
        done();
      });

      it('should attach to weave and register with navi', function (done) {
        ctx.worker._attachContainerToNetwork(function (err) {
          expect(err).to.be.undefined();
          expect(Sauron.prototype.attachHostToContainer.callCount).to.equal(1);
          expect(Sauron.prototype.attachHostToContainer.args[0][0])
              .to.equal(ctx.mockInstance.network.networkIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][1])
              .to.equal(ctx.mockInstance.network.hostIp);
          expect(Sauron.prototype.attachHostToContainer.args[0][2]).to.equal(ctx.data.id);
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][0])
              .to.equal(ctx.labels.ownerUsername);
          expect(Hosts.prototype.upsertHostsForInstance.args[0][1]).to.equal(ctx.mockInstance);
          done();
        });
      });
    });
  });

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _findInstance
      ctx.worker.instance = ctx.mockInstance;
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(null, ctx.mockInstance);
        done();
      });

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.undefined();
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1);
          expect(ctx.mockInstance.modifyContainerInspect.args[0][0])
              .to.equal(ctx.data.id);
          expect(ctx.mockInstance.modifyContainerInspect.args[0][1])
              .to.equal(ctx.data.inspectData);
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(new Error('this is an error'));
        done();
      });

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore();
        done();
      });

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error');
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1);
          done();
        });
      });
    });
  });
});
