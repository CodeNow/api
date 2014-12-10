'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');
var extend = require('extend');
var pick = require('101/pick');
var pluck = require('101/pluck');
var debug = require('debug')('runnable-api:dns:model');
var keypather = require('keypather')();
var formatArgs = require('format-args');
var not = require('101/not');
var hasKeypaths = require('101/has-keypaths');
// var debounce = require('debounce');

/*
  Global debounced send requests to route53 because of rate limits.
 */
var jobs = [];
var deleteJobs = [];

var sendRequests = function (jobs) {
  if (jobs.length === 0) { return; } // nothing to do
  var jobsToSend = jobs.splice(0, Math.min(99, jobs.length));
  var params = {
    HostedZoneId: process.env.ROUTE53_HOSTEDZONEID,
    ChangeBatch: {
      Changes: jobsToSend.map(pluck('change'))
    }
  };
  var route53 = new AWS.Route53();
  route53.changeResourceRecordSets(params,
    handleErr(callback, 'Error sending DNS entries', { changes: params.ChangeBatch.Changes }));
  function callback () {
    var job = jobsToSend.pop();
    while(job) {
      job.cb.apply(null, arguments);
      job = jobsToSend.pop();
    }
  }
};

// var debouncedSendRequests = debounce(sendRequests, process.env.DNS_JOB_QUEUE_INTERVAL);

setInterval(function () {
  sendRequests(jobs);
}, process.env.DNS_JOB_QUEUE_INTERVAL);
setInterval(function () {
  sendRequests(deleteJobs);
}, process.env.DNS_JOB_QUEUE_INTERVAL_DELETE);

// DNS Module

module.exports = Dns;

function Dns () {
  this.route53 = new AWS.Route53();
}

Dns.prototype.putEntry = function (url, ip, cb) {
  debug('putEntry', formatArgs(arguments));
  createJob('UPSERT', url, ip, cb);
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  debug('deleteEntry', formatArgs(arguments));
  createJob('DELETE', url, ip, callback);
  function callback (err) {
    // note: ignore not found errors!
    // one case where we have to is if the container immediately stops
    // sauron cannot be attached so we do not setup dns, hipache, sauron for the container
    // Since dns was never created, a restart of the container or update of name (any url
    // change update), will assume the dns has been setup before and therefore try to
    // delete it.. leading to "not found".
    if (err && !isNotFoundError(err)) {
      cb(err);
    }
    else {
      cb();
    }
  }
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


// helpers
//

/*
  all options from http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!AWS/Route53.html
*/
function createJob (type, name, ip, cb) {
  var change = {
    Action: type,
    ResourceRecordSet: {
      Name: name,
      Type: 'A',
      ResourceRecords: [{
        Value: ip
      }],
      TTL: 60 // one min
    }
  };
  if (type === 'UPSERT') {
    jobs = jobs.filter(not(hasKeypaths('change.ResourceRecordSet.Name.toLowerCase()',
                                      change.ResourceRecordSet.Name.toLowerCase())));
    jobs.push({
      change: change,
      cb: cb
    });
  } else if (type === 'DELETE') {
    deleteJobs = deleteJobs.filter(not(hasKeypaths('change.ResourceRecordSet.Name.toLowerCase()',
                                                  change.ResourceRecordSet.Name.toLowerCase())));
    deleteJobs.push({
      change: change,
      cb: cb
    });
  }
  // sendRequests();
}

function handleErr (cb, errMessage, errDebug) {
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
}


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
