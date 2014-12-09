'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');
var extend = require('extend');
var pick = require('101/pick');
var debug = require('debug')('runnable-api:dns:model');
var keypather = require('keypather')();
var dnsJobQueue = require('models/redis/dns-job-queue');

var uuid = require('uuid');

module.exports = Dns;

function Dns () {
  this.route53 = new AWS.Route53();
}

// err keys that are important from aws errs
Dns.errKeys = ['message', 'code', 'time', 'statusCode', 'retryable'];

/*
  all options from http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!AWS/Route53.html
*/
Dns.createJob = function (type, name, ip) {
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
};

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Route53.html#changeResourceRecordSets-property
// "A request cannot contain more than 100 Change elements."

Dns.prototype.putEntry = function (url, ip, cb) {
  debug('putEntry', formatArgs(arguments));
  var job = Dns.createJob('UPSERT', url, ip);
  dnsJobQueue.execJob(job,
    this.handleError(cb, 'Error upserting DNS entry', { url: url, ip: ip }));
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  debug('deleteEntry', formatArgs(arguments));
  var job = Dns.createJob('DELETE', url, ip);
  dnsJobQueue.execJob(job,
    this.handleError(callback, 'Error deleting DNS entry', { url: url, ip: ip }));
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

Dns.prototype.handleError = function (cb, errMessage, errDebug) {
  debug('create handleError callback (not err)', formatArgs(arguments));
  return function (errStr) {
    debug('handleError', formatArgs(arguments));
    if (err) {
      var jsonErr = JSON.parse(errStr); // TODO: try catch
      var err = new Error(jsonErr.message);
      extend(err, jsonErr);
      var parsed = parseRoute53Err(err, errMessage);
      extend(errDebug, pick(err, Dns.errKeys));
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
