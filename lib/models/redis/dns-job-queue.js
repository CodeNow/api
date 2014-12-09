'use strict';

var redis = require('./index');
var RedisMutex = require('./mutex');
var activeApi = require('models/redis/active-api');
var error = require('error');
var pluck = require('101/pluck');
var pick = require('101/pick');
var noop = require('101/noop');
var debug = require('run-debug')(__filename);
var formatArgs = require('format-args');
var Dns;
process.nextTick(function () {
  Dns = require('models/apis/dns');
});

function DnsJobQueue () {
  this.redis = redis.createClient();
  this.redisSub = redis.createClient(); // pub must be on diff client than sub
  this.key = process.env.REDIS_NAMESPACE+'dns-job-queue';
  this.mutex = new RedisMutex('dns-job-queue:lock');
}

DnsJobQueue.prototype.start = function (cb) {
  debug('start', process.env.DNS_JOB_QUEUE_INTERVAL, formatArgs(arguments));
  var self = this;
  this.interval = setInterval(function () {
    self.checkForJobs();
  }, process.env.DNS_JOB_QUEUE_INTERVAL);
  cb();
};

DnsJobQueue.prototype.stop = function (cb) {
  debug('stop', formatArgs(arguments));
  if (!this.interval) {
    cb(new Error('No interval'));
  }
  clearInterval(this.interval);
  delete this.interval;
  cb();
};

/**
 * - register callback for DNS API request completion event
 * - subscribe to DNS API request completion event
 * - insert DNS API job into queue
 */
DnsJobQueue.prototype.execJob = function (params, cb) {
  debug('execJob', formatArgs(arguments));
  var self = this;
  self.on(params.id, function (errStr) {
    debug('execJob finished', params.id, formatArgs(arguments));
    // if err, cast to err..
    self.unsub(params.id);
    var err;
    if (errStr) { err = error.parse(errStr); }
    cb(err);
  });
  self.sub(params.id, function (err) {
    debug('SUBSCRIBED!!!');
    if (err) { return cb(err); }
    self.rpush(params, function (errStr) {
      if (errStr) {
        debug('pushJob error', formatArgs(arguments));
        self.unsub(params.id);
        var err = error.parse(errStr);
        cb(err);
      }
    });
  });
};

DnsJobQueue.prototype.checkForJobs = function () {
  debug('checkForJobs', formatArgs(arguments));
  var self = this;
  self.lock(function (err, hasLock) {
    debug('Got lock', formatArgs(arguments));
    if (err) { return error.log(err); }
    if (!hasLock) { return self.unlock(noop); }

    activeApi.isMe(function (err, isMe) {
      debug('Is active api', formatArgs(arguments));
      if (err) { return unlockAndLog(err); }
      else if (!isMe) { return self.unlock(noop); }

      console.log('self.llen');
      self.llen(function (err, jobsLength) {
        debug('Job queue length', formatArgs(arguments));
        if (err) { return unlockAndLog(err); }
        if (jobsLength === 0) { return self.unlock(noop); }

        self.getJobs(0, Math.min(99, jobsLength-1), function (err, dnsJobs) {
          debug('Got jobs', formatArgs(arguments));
          if (err) { return unlockAndLog(err); }
          var body = {
            HostedZoneId: process.env.ROUTE53_HOSTEDZONEID,
            ChangeBatch: {
              Changes: dnsJobs.map(pluck('data'))
            }
          };
          var dns = new Dns();
          dns.route53.changeResourceRecordSets(body, dns.handleError(function (err) {
            if (err) { return unlockAndPub(err); }
            var job;
            while (dnsJobs.length) {
              job = dnsJobs.pop();
              debug('pop', job.id);
              self.pub(job.id);
            }
            self.unlock(error.logIfErr);
          }, 'Error upserting BATCH DNS entry', body));
          function unlockAndPub (err) {
            debug('unlockAndPub', err);
            dnsJobs.forEach(function (item) {
              var errStr = error.stringify(pick(err, Dns.errKeys));
              var job;
              while (dnsJobs.length) {
                job = dnsJobs.pop();
                self.pub(item.id, errStr);
              }
            });
            self.unlock(error.logIfErr);
          }
        });
      });
    });
  });
  function unlockAndLog (err) {
    error.log(err);
    self.unlock(error.logIfErr);
  }
};

// lock methods
DnsJobQueue.prototype.lock = function (cb) {
  debug('lock', formatArgs(arguments));
  this.mutex.lock(cb);
};

DnsJobQueue.prototype.unlock = function (cb) {
  debug('unlock', formatArgs(arguments));
  this.mutex.unlock(cb);
};

// list methods
DnsJobQueue.prototype.llen = function (cb) {
  debug('llen', formatArgs(arguments));
  this.redis.llen(this.key, cb);
};

DnsJobQueue.prototype.getJobs = function (first, last, cb) {
  debug('getJobs', formatArgs(arguments));
  this.redis.multi()
    .lrange(this.key, first, last)
    .ltrim(this.key, (last+1), -1)
    .exec(function (err, results) {
      if (err) { return cb(err); }
      cb(null, JSON.parse('['+results[0]+']'));
    });
  // this.redis.lrange(this.key, first, last, function (err, results) {
  //   if (err) { return cb(err); }
  //   debug(results);
  //   debug(typeof results);
  //   debug(typeof results[0]);
  //   cb(null, results);
  // });
};

DnsJobQueue.prototype.rpush = function (data, cb) {
  debug('rpush', formatArgs(arguments));
  this.redis.rpush(this.key, JSON.stringify(data), cb);
};

// pub sub methods
DnsJobQueue.prototype.pub = function (channel, data) {
  debug('pub', formatArgs(arguments));
  this.redis.publish(this.key+':'+channel, data || '');
};

DnsJobQueue.prototype.sub = function (channel, cb) {
  debug('sub', formatArgs(arguments));
  this.redisSub.subscribe(this.key+':'+channel, cb);
};

DnsJobQueue.prototype.on = function (channel, cb) {
  debug('on', formatArgs(arguments));
  channel = this.key+':'+channel;
  this.redisSub.on('message', function (channel2, message) {
    if (channel === channel2) {
      cb(null, message.toString());
    }
  });
};

DnsJobQueue.prototype.unsub = function (channel, cb) {
  debug('unsub', formatArgs(arguments));
  this.redisSub.unsubscribe(this.key+':'+channel, cb);
};

module.exports = new DnsJobQueue();