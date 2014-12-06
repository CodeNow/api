'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');
var extend = require('extend');
var pick = require('101/pick');
var debug = require('debug')('runnable-api:dns:model');
var keypather = require('keypather')();

var DnsJobQueue = require('models/redis/dns-job-queue');
var dnsJobQueue = new DnsJobQueue(process.env.REDIS_NAMESPACE+'dns-changes');
var activeApi = require('models/redis/active-api');
var uuid = require('uuid');
var error = require('error');

module.exports = Dns;

function Dns () {
  this.route53 = new AWS.Route53();
}

/*
  all options from http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!AWS/Route53.html
*/
function createParams (type, name, ip) {
  return {
    id: uuid(),
    data: {
      Action: type,
      ResourceRecordSet: {
        Name: name,
        Type: 'A',
        ResourceRecords: [{
          Value: ip
        }],
        TTL: 60 // one min
      }
    }
  };
}

activeApi.setAsMe(function (err) {
  if (err) {
    debug('activeApi.setMe', err);
    error.log('activeApi.setMe', err);
  }
  setInterval(batchChangeRequestHandler, 300);
});

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Route53.html#changeResourceRecordSets-property
// "A request cannot contain more than 100 Change elements."
function batchChangeRequestHandler () {
  var self;
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
              self.route53.changeResourceRecordSets(body, self.handleError(function (err) {
                if (err) {
                  debug('this.route53.changeResourceRecordSets', err);
                  error.log('this.route53.changeResourceRecordSets', err);
                }
                else {
                  dnsJobs.forEach(function (item) {
                    dnsJobQueue.pub(item.id, item.data);
                  });
                }
              }, 'Error upserting BATCH DNS entry', body));
            }
          });
        }
      });
    });
  });
}

Dns.prototype.putEntry = function (url, ip, cb) {
  debug('putEntry', formatArgs(arguments));
  var params = createParams('UPSERT', url, ip);
  dnsJobQueue.sub(params.id, cb);
  dnsJobQueue.rpush(params);
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  debug('deleteEntry', formatArgs(arguments));
  var params = createParams('DELETE', url, ip);
  dnsJobQueue.sub(params.id, cb);
  dnsJobQueue.rpush(params);
};

Dns.prototype.putEntryForInstance = function (instanceName, ownerUsername, hostIp, cb) {
  debug('putEntryForInstance', formatArgs(arguments));
  var url = instanceName + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.putEntry(url, hostIp, cb);
};

Dns.prototype.deleteEntryForInstance = function (instanceName, ownerUsername, hostIp, cb) {
  debug('deleteEntryForInstance', formatArgs(arguments));
  var url = instanceName + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.deleteEntry(url, hostIp, cb);
};

Dns.prototype.handleError = function (cb, errMessage, errDebug) {
  return function (err) {
    if (err) {
      var parsed = parseRoute53Err(err, errMessage);
      extend(errDebug, pick(err, ['message', 'code', 'time', 'statusCode', 'retryable']));
      var boomErr = Boom.create(parsed.code, parsed.message, { route53: errDebug, err: err });
      cb(boomErr);
    }
    else {
      cb();
    }
  };
};

function parseRoute53Err (err, errMessage) {
  var code;
  if (!err.statusCode) {
    code = 504;
  }
  else if (err.statusCode === 500) {
    code = 502;
  }
  else { // code >= 400 && code !== 500
    code = err.statusCode;
  }
  var route53ErrMessage = err.message || err.code;
  var message = route53ErrMessage ?
    errMessage+': '+route53ErrMessage :
    errMessage;

  return {
    code: code,
    message: message
  };
}

var notFoundRE = /not found/;
function isNotFoundError (err) {
  return notFoundRE.test(keypather.get(err, 'data.route53.message.toLowerCase()'));
}


function formatArgs (args) {
  var isFunction = require('101/is-function');
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (arg && arg._id || arg);
    });
}
