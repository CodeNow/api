'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');
var async = require('async');
var extend = require('extend');
var pick = require('101/pick');
var pluck = require('101/pluck');
var debug = require('debug')('runnable-api:dns:model');
var formatArgs = require('format-args');
var noop = require('101/noop');
var keypather = require('keypather')();
// var debounce = require('debounce');

/*
  Global debounced send requests to route53 because of rate limits.
 */
var jobs = [];
var deleteJobs = [];

var sendRequests = function (_jobs) {
  if (_jobs.length === 0) { return; } // nothing to do
  var jobsToSend = _jobs.splice(0, 99);
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
    while (job) {
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
  createJob('DELETE', url, ip, noop);
  return process.nextTick(cb); // callback immediately bc deletes happen at a long interval
};

Dns.generateUrl = function (instanceName, ownerName) {
  return instanceName + '-' + ownerName + '.' + process.env.USER_CONTENT_DOMAIN;
};

Dns.prototype.putEntryForInstance = function (instanceName, ownerUsername, instance, cb) {
  debug('putEntryForInstance', formatArgs(arguments));
  var hostIp = instance.network.hostIp;
  var urls = [];
  if (instance.masterPod) {
    // elastic url
    urls.push(Dns.generateUrl(instanceName + '-staging', ownerUsername));
    // direct url: if non-repo, add master. else add branch (which should be master)
    var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
    branch = branch || 'master';
    urls.push(Dns.generateUrl(branch + '-' + instanceName + '-staging', ownerUsername));
  }
  // can't have a non-repo instances outside of a master pod, so the URL master-redis (e.g.) set
  // above is all that we need to do!
  // legacy url
  urls.push(Dns.generateUrl(instanceName, ownerUsername));
  var self = this;
  async.each(urls,
    function (url, callback) {
      self.putEntry(url, hostIp, callback);
    },
    cb);
};

Dns.prototype.deleteEntryForInstance = function (instanceName, ownerUsername, instance, cb) {
  debug('deleteEntryForInstance', formatArgs(arguments));
  var hostIp = instance.network.hostIp;
  var urls = [];
  // legacy url
  urls.push(Dns.generateUrl(instanceName, ownerUsername));
  if (instance.masterPod) {
    // elastic url
    urls.push(Dns.generateUrl(instanceName + '-staging', ownerUsername));
    // direct url: if non-repo, add master. else add branch (which should be master)
    var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
    branch = branch || 'master';
    urls.push(Dns.generateUrl(branch + '-' + instanceName + '-staging', ownerUsername));
  }
  var self = this;
  async.each(urls,
    function (url, callback) {
      self.deleteEntry(url, hostIp, callback);
    },
    cb);
};


// helpers
//
/*
function notHasKeypaths (keypaths) {
  return function (obj) {
    return !hasKeypaths(obj, keypaths);
  };
}
*/
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
  // createJobs will never conflict with other creates bc they are surrounded by locks
  // and they actually wait on the interval to complete to callback.
  jobs = jobs.filter(function (item) {
    return item.change.ResourceRecordSet.Name.toLowerCase() !==
      change.ResourceRecordSet.Name.toLowerCase();
  });
  // deleteJobs need to be filtered bc we callback immediately before the deletion
  // actually occurs since deletions do not affect the user.
  deleteJobs = deleteJobs.filter(function (item) {
    return item.change.ResourceRecordSet.Name.toLowerCase() !==
      change.ResourceRecordSet.Name.toLowerCase();
  });
  if (type === 'UPSERT') {
    jobs.push({
      change: change,
      cb: cb
    });
  } else if (type === 'DELETE') {
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
      extend(errDebug, pick(err, [ 'message', 'code', 'time', 'statusCode', 'retryable' ]));
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
    errMessage + ': ' + route53ErrMessage :
    errMessage;

  return {
    code: code,
    message: message
  };
}

// var notFoundRE = /not found/;
// function isNotFoundError (err) {
//   return notFoundRE.test(keypather.get(err, 'data.route53.message.toLowerCase()'));
// }
