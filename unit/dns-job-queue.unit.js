var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var rewire = require('rewire');
var sinon = require('sinon');
var route53Fixture = require('../test/fixtures/route53');
var createCounter = require('callback-count');
require('loadenv')();

var dnsJobQueue;

describe('dnsJobQueue', function () {
  beforeEach(function (done) {
    route53Fixture.start();
    dnsJobQueue = rewire('models/dns-job-queue');
    done();
  });

  afterEach(function (done) {
    var count = createCounter(done);
    dnsJobQueue.stop(count.inc().next);
    route53Fixture.stop(count.inc().next);
  });

  it('should begin polling on an interval after start invoked', function (done) {
    var deleteIntervalId = dnsJobQueue.__get__('deleteIntervalId');
    var upsertIntervalId = dnsJobQueue.__get__('upsertIntervalId');
    expect(deleteIntervalId).to.equal(undefined);
    expect(upsertIntervalId).to.equal(undefined);
    dnsJobQueue.start();
    deleteIntervalId = dnsJobQueue.__get__('deleteIntervalId');
    upsertIntervalId = dnsJobQueue.__get__('upsertIntervalId');
    expect(deleteIntervalId).to.be.ok;
    expect(upsertIntervalId).to.be.ok;
    done();
  });

  it('should properly queue and run UPSERT+DELETE jobs; '+
     'removing jobs from queue after processing', function (done) {
    var cb = function () {
      expect(upsertQueue.length).to.equal(0);
      done();
    };
    dnsJobQueue.start();
    var upsertQueue = dnsJobQueue.__get__('upsertQueue');
    var deleteQueue = dnsJobQueue.__get__('deleteQueue');
    expect(upsertQueue.length).to.equal(0);
    dnsJobQueue.createJob('UPSERT',
                          'test-upsert-1',
                          '0.0.0.0',
                          cb);
    expect(deleteQueue.length).to.equal(0);
    expect(upsertQueue.length).to.equal(1);
    expect(upsertQueue[0].change.Action).to.equal('UPSERT');
    expect(upsertQueue[0].change.ResourceRecordSet.Name).to.equal('test-upsert-1');
    expect(upsertQueue[0].change.ResourceRecordSet.ResourceRecords[0].Value).to.equal('0.0.0.0');
    expect(upsertQueue[0].cb).to.equal(cb);
  });

  it('should properly complete all jobs before stopping', function (done) {
    var upsertQueue = dnsJobQueue.__get__('upsertQueue');
    var deleteQueue = dnsJobQueue.__get__('deleteQueue');
    var finalCallback = sinon.spy();
    var count = createCounter(finalCallback);
    var cb1 = count.inc().next;
    var cb2 = count.inc().next;
    var cb3 = count.inc().next;
    var cb4 = count.inc().next;
    dnsJobQueue.createJob('UPSERT',
                          'test-upsert-1',
                          '0.0.0.0',
                          cb1);
    dnsJobQueue.createJob('UPSERT',
                          'test-upsert-2',
                          '0.0.0.0',
                          cb2);
    dnsJobQueue.createJob('UPSERT',
                          'test-upsert-3',
                          '0.0.0.0',
                          cb3);
    dnsJobQueue.createJob('DELETE',
                          'test-delete-1',
                          '0.0.0.0',
                          cb4);
    dnsJobQueue.start();
    expect(upsertQueue.length).to.equal(3);
    expect(deleteQueue.length).to.equal(1);
    dnsJobQueue.stop(function () {
      expect(upsertQueue.length).to.equal(0);
      expect(deleteQueue.length).to.equal(0);
      sinon.assert.calledOnce(finalCallback);
      expect();
      done();
    });
  });

});
