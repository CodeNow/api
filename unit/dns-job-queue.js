var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var sinon = require('sinon');
var async = require('async');

require('loadenv')(); // MUST BE FIRST AFTER LAB
var dnsJobQueue = require('models/redis/dns-job-queue');
var activeApi = require('models/redis/active-api');
var Dns = require('models/apis/dns');
var createCount = require('callback-count');
var redis = require('models/redis');

describe('DnsJobQueue', { timeout: process.env.DNS_JOB_QUEUE_INTERVAL*5 }, function () {
  var ctx = {};

  function tick (ms) {
    ctx.clock.tick(ms || process.env.DNS_JOB_QUEUE_INTERVAL);
  }

  describe('start', function() {
    beforeEach(function (done) {
      ctx.clock = sinon.useFakeTimers();
      var count = createCount(function () {
        done();
        tick();
      });
      activeApi.setAsMe(count.inc().next);
      dnsJobQueue.unlock(count.inc().next);
      dnsJobQueue.start(count.inc().next);
    });
    beforeEach(require('fixtures/route53').start);
    afterEach(function (done) {
      var count = createCount(done);
      ctx.clock.restore();
      activeApi.del(count.inc().next);
      dnsJobQueue.stop(count.inc().next);
      redis.del(process.env.REDIS_NAMESPACE+'dns-job-queue', count.inc().next);
    });
    afterEach(require('fixtures/route53').stop);

    it('should start and invoke checkForJobs', function (done) {
      sinon.spy(dnsJobQueue, 'checkForJobs');
      tick();
      expect(dnsJobQueue.checkForJobs.called).to.equal(true);
      dnsJobQueue.checkForJobs.restore();
      done();
    });

    describe('createJob', function() {
      afterEach(function (done) {
        // necessary to force Lab to continue
        //tick();
        done();
      });

      it('should create an upsert job '+
         'and register API completion event callbacks', function(done) {
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        sinon.spy(dnsJobQueue, 'on');
        sinon.spy(dnsJobQueue, 'sub');
        dnsJobQueue.execJob(job, function (err) {
          // callback to fire when API returns
        });
        tick();
        // callback was registered for API completion event (redis)
        expect(dnsJobQueue.on.calledOnce).to.equal(true);
        expect(dnsJobQueue.sub.calledOnce).to.equal(true);
        // poll redis to verify job was inserted
        var found = false;
        async.doWhilst(
          function (cb) {
            redis.lrange(process.env.REDIS_NAMESPACE+'dns-job-queue', 0, 1, function (err, list) {
              if (!list.length) return cb();
              var foundJob = list[list.length-1];
              found = (JSON.parse(foundJob).id === job.id);
              cb();
            });
          },
          function () { return !found; },
          function (err) {
            done();
            tick();
          }
        );
      });

      it('should remove jobs when interval ticks', function (done) {
        ctx.clock.restore();
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        dnsJobQueue.execJob(job, function () {
          done();
        });
      });

      it('should fire relevant callbacks when API '+
         'responds to batch request', function (done) {

        done();
      });
    });
  });
});
