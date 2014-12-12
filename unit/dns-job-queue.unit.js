var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var rewire = require('rewire');
var sinon = require('sinon');
var createCount = require('callback-count');
var route53Fixture = require('fixtures/route53');
require('loadenv')();

var dnsJobQueue;

var baseUpsertJob = {
  Action: null, // type
  ResourceRecordSet: {
    Name: null, // name
    Type: 'A',
    ResourceRecords: [], // { Value: ip }
    TTL: 60
  }
};

describe('dnsJobQueue', function () {
  beforeEach(function (done) {
    route53Fixture.start();
    dnsJobQueue = rewire('models/dns-job-queue');
    done();
  });

  afterEach(function (done) {
    var count = createCount(done);
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

  it ('should queue and run UPSERT+DELETE jobs', function (done) {

    var cb = function () {
      expect(upsertQueue.length).to.equal(0);
      done();
    };
    dnsJobQueue.start();

    var upsertQueue = dnsJobQueue.__get__('upsertQueue');
    expect(upsertQueue.length).to.equal(0);
    dnsJobQueue.createJob('UPSERT',
                          'test-upsert-1',
                          '0.0.0.0',
                          cb);
    expect(upsertQueue.length).to.equal(1);

  });
});
