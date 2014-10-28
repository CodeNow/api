'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var Boom = require('dat-middleware').Boom;
var AWS = require('aws-sdk');

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

Dns.prototype.putEntryForInstance = function (instance, ownerUsername, cb) {
  var url = instance.name + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.putEntry(url, instance.network.hostIp, cb);
};

Dns.prototype.putEntry = function (url, ip, cb) {
  var params = createParams('UPSERT', url, ip);
  this.route53.changeResourceRecordSets(params, handleRes(cb));
};

Dns.prototype.deleteEntryForInstance = function (instance, ownerUsername, cb) {
  var url = instance.name + '.' + ownerUsername + '.' + process.env.DOMAIN;
  this.deleteEntry(url, instance.network.hostIp, cb);
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  var params = createParams('DELETE', url, ip);
  this.route53.changeResourceRecordSets(params, handleRes(cb));
};

function handleRes (cb) {
  return function (err) {
    if (err) {
      return cb(Boom.create(500, 'AWS error', {
        AWS: {
          err: err,
          stack: err.stack
        }
      }));
    }
    return cb();
  };
}
