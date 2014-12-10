var AWS = require('aws-sdk');
var isObject = require('101/is-object');
var find = require('101/find');
var findIndex = require('101/find-index');
var noop = require('101/noop');
var exists = require('101/exists');
var hasKeypaths = require('101/has-keypaths');
var keypather = require('keypather')();
var async = require('async');
var formatArgs = require('format-args');
var debug = require('debug')('runnable-api:fixtures:route53');

var requireKeypath = function (obj, keypath) {
  var val = keypather.get(obj, keypath);
  if (!exists(val)) {
    throw new Error('"params.' + keypath + '" is required');
  }
  return val;
};
// cache for restoration later

var Route53 = AWS.Route53;
var mock = module.exports = {};

/**
 * start route53 mock
 * @param  {Function} cb callback
 */
mock.start = function (cb) {
  debug('start', formatArgs(arguments));
  cb = cb || noop;
  if (AWS.Route53 !== Route53) {
    console.log('already started');
    return cb();
  }
  AWS.Route53 = function () {
    var route53 = new Route53();
    route53.changeResourceRecordSets = changeResourceRecordSets;
    return route53;
  };
  cb();
  return this;
};

  function changeResourceRecordSets (params, cb) {
    debug('changeResourceRecordSets mock!', params);
    if (!params) {
      throw new Error('params is required');
    }
    if (!isObject(params)) {
      throw new Error('params must be an object');
    }
    requireKeypath(params, 'HostedZoneId');
    requireKeypath(params, 'ChangeBatch');
    requireKeypath(params, 'ChangeBatch.Changes');
    async.each(params.ChangeBatch.Changes, function (change, cb) {
      var action = requireKeypath(change, 'Action');
      var resourceRecordSet = requireKeypath(change, 'ResourceRecordSet');
      requireKeypath(change, 'ResourceRecordSet.Name');
      requireKeypath(change, 'ResourceRecordSet.Type');
      requireKeypath(change, 'ResourceRecordSet.ResourceRecords[0].Value');
      requireKeypath(change, 'ResourceRecordSet.TTL');
      if (action.toUpperCase() === 'UPSERT') {
        mockUpsert(resourceRecordSet, cb);
      }
      else if (action.toUpperCase() === 'DELETE') {
        mockDelete(resourceRecordSet, cb);
      }
      else {
        throw new Error('Unexpected "ChangeBatch.Changes[0].Action" value "' +
          action + '" (mock expects UPSERT|DELETE)');
      }
    }, cb);
  }

/**
 * stop route53 mock
 * @param  {Function} cb callback
 */
mock.stop = function (cb) {
  debug('stop', formatArgs(arguments));
  cb = cb || noop;
  AWS.Route53 = Route53;
  mock.reset();
  cb();
  return this;
};

// mock dns records
var records = [];
/**
 * reset mock records for route53
 */
mock.reset = function (cb) {
  debug('reset');
  cb = cb || noop;
  records = [];
  cb();
};

mock.findRecordIp = function (name) {
  var record = find(records, hasKeypaths({'Name.toLowerCase()':name.toLowerCase()})) || {};
  return keypather.get(record, 'ResourceRecords[0].Value');
};

/**
 * route53 mock behavior
 */

// all the types of responses route53 can return
var resp = {
  nameNotPermittedErr: function (name) {
    var message = 'RRSet with DNS name {name}. is not permitted in zone {domain}.'
      .replace('{name}', name)
      .replace('{domain}', process.env.DOMAIN);
    return this.err(400, message);
  },
  deleteNotFoundErr: function (name, type) {
    var message =
      "Tried to delete resource record set [name='{name}.', type='{type}']" +
      " but it was not found";
    message = message
      .replace('{name}', name)
      .replace('{type}', type);
    return this.err(400, message);
  },
  deleteFoundNotMatchErr: function () {
    var message =
      "Tried to delete resource record set [name='{name}.', type='{type}'] " +
      "but the values provided do not match the current values";
    message = message
      .replace('{name}', name)
      .replace('{type}', type);
    return this.err(400, message);
  },
  err: function (statusCode, message) {
    return {
      message: message,
      code: 'InvalidChangeBatch',
      time: (new Date()).toString(),
      statusCode: statusCode,
      retryable: false
    };
  },
  success: function () {
    return {
      ChangeInfo: {
        Id: generateId(),
        Status: 'PENDING',
        SubmittedAt: (new Date()).toString()
      }
    };
  }
};

/**
 * mocks route53 upsert action
 * @param  {Object}   resourceRecordSet params.ChangeBatch.Changes[0].ResourceRecordSet
 * @param  {Function} cb                callback
 */
function mockUpsert (resourceRecordSet, cb) {
  debug('mockUpsert', formatArgs(arguments));
  var domainRe = new RegExp(escapeRegExp(process.env.DOMAIN)+'$');
  var name = resourceRecordSet.Name;
  if (!domainRe.test(name)) {
    cb(resp.nameNotPermittedErr(name));
  }
  else {
    // async
    process.nextTick(function () {
      records.push(resourceRecordSet);
      cb(null, resp.success());
    });
  }

}

/**
 * mocks route53 delete action
 * @param  {Object}   resourceRecordSet params.ChangeBatch.Changes[0].ResourceRecordSet
 * @param  {Function} cb                callback
 */
function mockDelete (resourceRecordSet, cb) {
  debug('mockDelete', formatArgs(arguments));
  var name = resourceRecordSet.Name;
  var type = resourceRecordSet.Type;
  var index = findIndex(records, hasKeypaths({
    Name: name,
    Type: type
  }));
  var record = ~index ? records[index] : null;
  var equalRecord = find(records, hasKeypaths({
    Name: name,
    Type: type,
    'ResourceRecords[0].Value': resourceRecordSet.ResourceRecords[0].Value,
    TTL: resourceRecordSet.TTL
  }));
  // async
  process.nextTick(function () {
    if (!exists(record)) {
      cb(resp.deleteNotFoundErr(name, type));
    }
    else if (!exists(equalRecord)){
      cb(resp.deleteNotFoundErr(name, type));
    }
    else {
      records.splice(index, 1);
      cb(null, resp.success());
    }
  });
}

/**
 * generate successful change-info update id
 * @return {String} id, ex: '/change/C2LWIHXHH8HS2S'
 */
function generateId () {
  var id = '';
  var len = 14;
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (var i=0; i < len; i++ ) {
    id += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return '/change/'+id;
}

// http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}