var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

require('loadenv')(); // MUST BE FIRST AFTER LAB
var dnsJobQueue = require('models/redis/dns-job-queue');
var activeApi = require('models/redis/active-api');
var Dns = require('models/apis/dns');
var createCount = require('callback-count');

describe('DnsJobQueue', { timeout: process.env.DNS_JOB_QUEUE_INTERVAL*2 }, function () {
  var ctx = {};
  describe('start', function() {
    beforeEach(function (done) {
      var count = createCount(done);
      activeApi.setAsMe(count.inc().next);
      dnsJobQueue.unlock(count.inc().next);
      dnsJobQueue.start(count.inc().next);
      // cache for later restoration
      ctx.origCheckForJobs = dnsJobQueue.checkForJobs;
    });
    beforeEach(require('fixtures/route53').start);
    afterEach(function (done) {
      var count = createCount(done);
      activeApi.del(count.inc().next);
      dnsJobQueue.stop(count.inc().next);
      // restore back to original
      dnsJobQueue.checkForJobs = ctx.origCheckForJobs;
    });
    afterEach(require('fixtures/route53').stop);

    it('should start and invoke checkForJobs', function (done) {
      dnsJobQueue.checkForJobs = done;
    });

    describe('createJob', function() {
      it('should create an upsert job and make request dns', function(done) {
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        dnsJobQueue.execJob(job, done);
      });
      // it('should create an upsert job and make request dns', function(done) {
      //   dnsJobQueue.createJob(Dns.createParams('UPSERT'))
      // });
    });
  });
});
