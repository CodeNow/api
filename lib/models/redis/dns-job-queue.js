'use strict';

var redis = require('./index');
var RedisMutex = require('./mutex');
var activeApi = require('models/redis/active-api');
var error = require('error');
var debug = require('debug')('runnable-api:redis:dns-job-queue');
var noop = require('101/noop');
var Dns = require('models/apis/dns');

module.exports = new DnsJobQueue();

function DnsJobQueue () {
  this.redis = redis;
  this.key = process.env.REDIS_NAMESPACE+'dns-job-queue';
  this.mutex = new RedisMutex(this.key);
}

DnsJobQueue.prototype.start = function (cb) {
  var self = this;
  activeApi.setAsMe(function (err) {
    if (err) { return cb(err); }
    setInterval(self.checkForJobs.bind(self), 300);
  });
};

DnsJobQueue.prototype.checkForJobs = function () {
  var dnsJobQueue = this;
  dnsJobQueue.lock(function (err, hasLock) {
    if (err) {
      debug('dnsJobQueue.lock', err);
      error.log('dnsJobQueue.lock', err);
    }
    if (!hasLock) { return; }

    activeApi.isMe(function (err, isMe) {
      if (err) {
        debug('activeApi.isMe', err);
        error.log('activeApi.isMe', err);
      }
      if (!isMe) { return; }

      var body = {
        HostedZoneId: process.env.ROUTE53_HOSTEDZONEID,
        ChangeBatch: {
          Changes: []
        }
      };

      dnsJobQueue.llen(function (err, listLength) {
        if (err) {
          debug('llen', dnsJobQueue.key, err);
          error.log('llen', dnsJobQueue.key, err);
        }
        else if (listLength === 0) {
          return; // no jobs
        }
        else {
          dnsJobQueue.lrangepop(0, Math.min(99, listLength-1), function (err, dnsJobs) {
            if (err) {
              error.log('batchChangeRequestHandler',
                        dnsJobQueue.key,
                        err,
                        dnsJobs);
              debug('batchChangeRequestHandler',
                    dnsJobQueue.key,
                    err,
                    dnsJobs);
            }
            else {
              body.ChangeBatch.Changes.push(dnsJobs.map(function (listItem) {
                return listItem.data;
              }));
              var dns = new Dns();
              dns.route53.changeResourceRecordSets(body, dns.handleError(function (err) {
                if (err) {
                  debug('this.route53.changeResourceRecordSets', err);
                  error.log('this.route53.changeResourceRecordSets', err);
                }
                else {
                  dnsJobs.forEach(function (item) {
                    dnsJobQueue.pub(item.id, item.data);
                  });
                  dnsJobQueue.unlock(noop);
                }
              }, 'Error upserting BATCH DNS entry', body));
            }
          });
        }
      });
    });
  });
};

DnsJobQueue.prototype.lock = function (cb) {
  this.mutex.lock(cb);
};

DnsJobQueue.prototype.unlock = function (cb) {
  this.mutex.unlock(cb);
};

DnsJobQueue.prototype.llen = function (cb) {
  this.redis.llen(this.key, cb);
};

DnsJobQueue.prototype.lrangepop = function (first, last, length, cb) {
  this.redis.multi()
    .lrange(this.key, first, last)
    .ltrim(last, -1)
    .exec(cb);
};

DnsJobQueue.prototype.rpush = function (data, cb) {
  this.redis.rpush(this.key, data, cb);
};

DnsJobQueue.prototype.pub = function (channel, data) {
  this.redisPub.pub(this.key+':'+channel, data);
};

DnsJobQueue.prototype.sub = function (channel, cb) {
  this.redis.sub(this.key+':'+channel, cb);
};
