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

  var REDIS_KEY = process.env.REDIS_NAMESPACE+'dns-job-queue';

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
      redis.del(REDIS_KEY, count.inc().next);
    });
    afterEach(require('fixtures/route53').stop);

    it('should start and invoke checkForJobs', function (done) {
      sinon.spy(dnsJobQueue, 'checkForJobs');
      tick();
      expect(dnsJobQueue.checkForJobs.called).to.equal(true);
      dnsJobQueue.checkForJobs.restore();
      done();
    });

    describe('execJob', function() {
      it('should create an upsert job '+
         'and register API completion event callbacks', function(done) {
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        sinon.spy(dnsJobQueue, 'on');
        sinon.spy(dnsJobQueue, 'sub');
        dnsJobQueue.execJob(job, function () {
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
            redis.lrange(REDIS_KEY, 0, 1, function (err, list) {
              if (!list.length) { return cb(); }
              var foundJob = list[list.length-1];
              found = (JSON.parse(foundJob).id === job.id);
              cb();
            });
          },
          function () { return !found; },
          function () {
            done();
            tick();
          }
        );
      });

      it('should not make an API request if jobs queue is empty', function (done) {
        ctx.clock.restore();
        // verify isMe and llen is 0
        sinon.spy(dnsJobQueue, 'getJobs');
        var cache_llen = dnsJobQueue.llen;
        dnsJobQueue.llen = function () {
          dnsJobQueue.llen = cache_llen;
          expect(dnsJobQueue.getJobs.called).to.equal(false);
          dnsJobQueue.getJobs.restore();
          done();
        };
        dnsJobQueue.checkForJobs();
      });

      it('should remove jobs when querying queue', function (done) {
        ctx.clock.restore();
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        var job2 = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        var count = createCount(function () {
          // assert job queue is empty
          redis.lrange(REDIS_KEY, 0, 100, function (err, list) {
            if (err) { throw err; }
            expect(list.length).to.equal(0);
            done();
          });
        });
        dnsJobQueue.execJob(job, count.inc().next);
        dnsJobQueue.execJob(job2, count.inc().next);
      });

      it('should unsubscribe & cleanup after API returns', function (done) {
        ctx.clock.restore();
        var job = Dns.createJob(
          'UPSERT', 'http://hey.'+process.env.DOMAIN, '192.168.1.1');
        sinon.spy(dnsJobQueue, 'unsub');
        dnsJobQueue.execJob(job, function () {
          expect(dnsJobQueue.unsub.calledOnce).to.equal(true);
          expect(dnsJobQueue.unsub.args[0][0]).to.equal(job.id);
          done();
        });
      });
    });

    describe('stop', function () {
      it('should cease polling for jobs when lock lost', function (done) {
        //ctx.clock.restore();

        sinon.spy(dnsJobQueue, 'checkForJobs');
        sinon.spy(dnsJobQueue, 'llen');

        dnsJobQueue.unlock(function () {
          setTimeout(function () {

            expect(dnsJobQueue.checkForJobs.called).to.equal(true);
            expect(dnsJobQueue.llen.called).to.equal(false);
            dnsJobQueue.checkForJobs.restore();
            dnsJobQueue.llen.restore();
            done();

          }, 300);
          tick();

        });
        tick();

      });
    });
  });
});
