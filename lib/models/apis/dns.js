'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');
var extend = require('extend');
var pick = require('101/pick');

module.exports = Dns;

function Dns () {
  this.route53 = new AWS.Route53();
}

/*
  all options from http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!AWS/Route53.html
*/
function createParams (type, name, ip) {
  return {
    HostedZoneId: process.env.ROUTE53_HOSTEDZONEID,
    ChangeBatch: {
      Changes: [{
        Action: type,
        ResourceRecordSet: {
          Name: name,
          Type: 'A',
          ResourceRecords: [{
            Value: ip
          }],
          TTL: 60 // one min
        }
      }]
    }
  };
}

Dns.prototype.putEntry = function (url, ip, cb) {
  var params = createParams('UPSERT', url, ip);
  this.route53.changeResourceRecordSets(params,
    this.handleError(cb, 'Error upserting DNS entry', { url: url, ip: ip }));
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  var params = createParams('DELETE', url, ip);
  this.route53.changeResourceRecordSets(params,
    this.handleError(cb, 'Error deleting DNS entry', { url: url, ip: ip }));
};

Dns.prototype.putEntryForInstance = function (instance, ownerUsername, cb) {
  var url = instance.name + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.putEntry(url, instance.network.hostIp, cb);
};

Dns.prototype.deleteEntryForInstance = function (instance, ownerUsername, cb) {
  var url = instance.name + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.deleteEntry(url, instance.network.hostIp, cb);
};

Dns.prototype.handleError = function (cb, errMessage, errDebug) {
  return function (err) {
    var code;
    if (err) {
      if (!err.statusCode) {
        code = 504;
      }
      else if (err.statusCode === 500) {
        code = 502;
      }
      else { // code >= 400 && code !== 500
        code = err.statusCode;
      }
      var message = err.code ?
        errMessage+': '+err.code :
        errMessage;
      extend(errDebug, pick(err, ['message', 'code', 'time', 'statusCode', 'retryable']));
      var boomErr = Boom.create(code, message, { route53: errDebug, err: err });
      cb(boomErr);
    }
    else {
      cb();
    }
  };
};
