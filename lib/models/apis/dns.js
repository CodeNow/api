'use strict';

/* Dns is used add/remove dns entries to route53 to allow containers to talk to each other */

var debug = require('debug')('runnable-api:dns:model');
var formatArgs = require('format-args');
var dnsJobQueue = require('models/dns-job-queue');

module.exports = Dns;

function Dns () {}

Dns.prototype.putEntry = function (url, ip, cb) {
  debug('putEntry', formatArgs(arguments));
  dnsJobQueue.createJob('UPSERT', url, ip, cb);
};

Dns.prototype.deleteEntry = function (url, ip, cb) {
  debug('deleteEntry', formatArgs(arguments));
  dnsJobQueue.createJob('DELETE', url, ip, cb);
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
