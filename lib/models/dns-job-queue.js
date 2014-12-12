'use strict';

var AWS = require('aws-sdk');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:dns:model');
var extend = require('extend');
var formatArgs = require('format-args');
var pick = require('101/pick');
var pluck = require('101/pluck');
var noop = require('101/noop');

module.exports = {
  createJob: createJob,
  start: start,
  stop: stop
};

var deleteIntervalId;
var upsertIntervalId;
var deleteQueue = [];
var upsertQueue = [];
var stopCallback;

function intervalProcess (jobs) {
  console.log('intervalProcess', jobs);
  if (jobs.length === 0) {
    if (stopCallback) {
      stop(stopCallback);
    }
    return;
  }
  var jobsToSend = jobs.splice(0, 99);
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
}

function start () {
  console.log('start');
  upsertIntervalId = setInterval(function () {
    intervalProcess(upsertQueue);
  }, process.env.DNS_JOB_QUEUE_INTERVAL);
  deleteIntervalId = setInterval(function () {
    intervalProcess(deleteQueue);
  }, process.env.DNS_JOB_QUEUE_INTERVAL_DELETE);
}

function stop (cb) {
  console.log('stop');
  if (deleteQueue.length === 0 && upsertQueue.length === 0) {
    // make async in case callback-count used
    process.nextTick(cb);
    if (upsertIntervalId) {
      clearInterval(upsertIntervalId);
      clearInterval(deleteIntervalId);
    }
  } else {
    stopCallback = cb;
  }
}

// createJobs will never conflict with other creates bc they are surrounded by locks
// and they actually wait on the interval to complete to callback.
function filter (queue, change) {
  queue = queue.filter(function (queueItem) {
    return queueItem.change.ResourceRecordSet.Name.toLowerCase() !==
      change.ResourceRecordSet.Name.toLowerCase();
  });
}

// https://app.datadoghq.com/monitors/triggered?monitor_id=112731&monitor_group=name:alpha-dock2
function createJob (type, name, ip, cb) {
  debug('createJob', formatArgs(arguments));
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

  filter(deleteQueue, change);
  filter(upsertQueue, change);

  if (type === 'UPSERT') {
    upsertQueue.push({
      change: change,
      cb: cb
    });
  } else if (type === 'DELETE') {
    deleteQueue.push({
      change: change,
      cb: noop
    });
    process.nextTick(cb); // callback immediately bc deletes happen at a long interval
  }
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
