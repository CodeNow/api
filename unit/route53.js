var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;

require('loadenv')();

var AWS = require('aws-sdk');
var route53 = new AWS.Route53();
var uuid = require('uuid');

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

describe('unit test', function () {
 it('delete non existing', function(done) {
   route53.changeResourceRecordSets(createParams('DELETE','mavis.codenow.runnable3.net', '10.0.0.0'), function(err, data) {
     console.log('err', err, 'data', data);
     done();
   });
 });
 it('delete diffent domain', function(done){
   route53.changeResourceRecordSets(createParams('DELETE','api.net', '10.0.0.0'), function (err, data) {
     console.log('err', err, 'data', data);
     done();
   });
 });
 it('delete valid entry', function(done){
   route53.changeResourceRecordSets(createParams('UPSERT','anand.runnable3.net', '10.0.0.0'), function(err, data) {
     console.log('1err', err, '1data', data);
     route53.changeResourceRecordSets(createParams('DELETE','anand.runnable3.net', '10.0.0.0'), function(err, data) {
       console.log('2err', err, '2data', data);
       done();
     });
   });
 });
 it('delete valid with different data', function(done){
   route53.changeResourceRecordSets(createParams('UPSERT','code.runnable3.net', '10.0.0.0'), function(err, data) {
     console.log('1err', err, '1data', data);
     route53.changeResourceRecordSets(createParams('DELETE','code.runnable3.net', '10.0.0.1'), function(err, data) {
       console.log('2err', err, '2data', data);
       done();
     });
   });
 });
});


/**
* api$ NODE_PATH=./lib NODE_ENV=test ./node_modules/.bin/lab -v -l -e test ./unit/dns-test.js
err { [InvalidChangeBatch: Tried to delete resource record set [name='mavis.codenow.runnable3.net.', type='A'] but it was not found]
  message: 'Tried to delete resource record set [name=\'mavis.codenow.runnable3.net.\', type=\'A\'] but it was not found',
  code: 'InvalidChangeBatch',
  time: Thu Oct 30 2014 18:40:19 GMT-0700 (PDT),
  statusCode: 400,
  retryable: false } data null
unit test
  ✔ 1) delete non existing (571 ms)
err { [InvalidChangeBatch: Tried to delete resource record set [name='api.net.', type='A'] but it was not found]
  message: 'Tried to delete resource record set [name=\'api.net.\', type=\'A\'] but it was not found',
  code: 'InvalidChangeBatch',
  time: Thu Oct 30 2014 18:40:19 GMT-0700 (PDT),
  statusCode: 400,
  retryable: false } data null
  ✔ 2) delete diffent domain (514 ms)
1err null 1data { ChangeInfo:
  { Id: '/change/C2LWIHXHH8HS2S',
    Status: 'PENDING',
    SubmittedAt: Thu Oct 30 2014 18:40:20 GMT-0700 (PDT) } }
2err null 2data { ChangeInfo:
  { Id: '/change/CSV2SOITV9SBV',
    Status: 'PENDING',
    SubmittedAt: Thu Oct 30 2014 18:40:20 GMT-0700 (PDT) } }
  ✔ 3) delete valid entry (1055 ms)
1err null 1data { ChangeInfo:
  { Id: '/change/C3JS5H3HY5P10H',
    Status: 'PENDING',
    SubmittedAt: Thu Oct 30 2014 18:40:21 GMT-0700 (PDT) } }
2err { [InvalidChangeBatch: Tried to delete resource record set [name='code.runnable3.net.', type='A'] but the values provided do not match the current values]
  message: 'Tried to delete resource record set [name=\'code.runnable3.net.\', type=\'A\'] but the values provided do not match the current values',
  code: 'InvalidChangeBatch',
  time: Thu Oct 30 2014 18:40:22 GMT-0700 (PDT),
  statusCode: 400,
  retryable: false } 2data null
  ✔ 4) delete valid with different data (1031 ms)
*/

process.env.DOMAIN = 'runnable3.net';
describe('UPSERT', function () {
  var ctx = {};
  afterEach(function (done) {
    var params = createParams('DELETE', ctx.url, ctx.ip);
    route53.changeResourceRecordSets(params, function () {
      console.log('DELETE', arguments);
      done();
    });
  });
  afterEach(function (done) {
    ctx = {};
    done();
  });
  describe('valid', function () {
    beforeEach(function (done) {
      ctx.url = uuid() + '.' + process.env.DOMAIN;
      ctx.ip  = '0.0.0.0';
      done();
    });
    describe('once', function () {
      it('should create the dns entry', function (done) {
        var params = createParams('UPSERT', ctx.url, ctx.ip);
        route53.changeResourceRecordSets(params, function () {
          console.log('once create', arguments);
          done();
        });
      });
    });
    describe('twice', function () {
      beforeEach(function (done) {
        var params = createParams('UPSERT', ctx.url, ctx.ip);
        route53.changeResourceRecordSets(params, function () {
          console.log('before create', arguments);
          done();
        });
      });
      it('should create the dns entry', function (done) {
        var params = createParams('UPSERT', ctx.url, ctx.ip);
        route53.changeResourceRecordSets(params, function () {
          console.log('before create', arguments);
          done();
        });
      });
    });
  });
  describe('invalid', function () {
    beforeEach(function (done) {
      ctx.url = uuid();
      ctx.ip  = '0.0.0.0';
      done();
    });
    it('should NOT create the dns entry', function (done) {
      var params = createParams('UPSERT', ctx.url, ctx.ip);
      route53.changeResourceRecordSets(params, function () {
        console.log('INVALID once create', arguments);
        done();
      });
    });
  });
});

/**
* api$ NODE_PATH=./lib NODE_ENV=test ./node_modules/.bin/lab -v -l -e test ./unit/dns-test.js
once create { '0': null,
  '1':
  { ChangeInfo:
      { Id: '/change/C307DAP4TWD8E7',
        Status: 'PENDING',
        SubmittedAt: Thu Oct 30 2014 18:57:32 GMT-0700 (PDT) } } }
UPSERT
  valid
    once
      ✔ 1) should create the dns entry (573 ms)
DELETE { '0': null,
  '1':
  { ChangeInfo:
      { Id: '/change/C1QWP2YSGNB47L',
        Status: 'PENDING',
        SubmittedAt: Thu Oct 30 2014 18:57:32 GMT-0700 (PDT) } } }
before create { '0': null,
  '1':
  { ChangeInfo:
      { Id: '/change/C2YGX0GY9REUQP',
        Status: 'PENDING',
        SubmittedAt: Thu Oct 30 2014 18:57:33 GMT-0700 (PDT) } } }
before create { '0': null,
  '1':
  { ChangeInfo:
      { Id: '/change/C3DAVIKRG6CQDD',
        Status: 'PENDING',
        SubmittedAt: Thu Oct 30 2014 18:57:33 GMT-0700 (PDT) } } }
    twice
      ✔ 2) should create the dns entry (510 ms)
DELETE { '0': null,
  '1':
  { ChangeInfo:
      { Id: '/change/C992QAFPCCEIF',
        Status: 'PENDING',
        SubmittedAt: Thu Oct 30 2014 18:57:34 GMT-0700 (PDT) } } }
INVALID once create { '0':
  { [InvalidChangeBatch: RRSet with DNS name 8d6fdad1-c474-43cd-8aa0-b22a9e98279e. is not permitted in zone runnable3.net.]
    message: 'RRSet with DNS name 8d6fdad1-c474-43cd-8aa0-b22a9e98279e. is not permitted in zone runnable3.net.',
    code: 'InvalidChangeBatch',
    time: Thu Oct 30 2014 18:57:34 GMT-0700 (PDT),
    statusCode: 400,
    retryable: false },
  '1': null }
  invalid
    ✔ 3) should NOT create the dns entry (501 ms)
DELETE { '0':
  { [InvalidChangeBatch: Tried to delete resource record set [name='8d6fdad1-c474-43cd-8aa0-b22a9e98279e.', type='A'] but it was not found]
    message: 'Tried to delete resource record set [name=\'8d6fdad1-c474-43cd-8aa0-b22a9e98279e.\', type=\'A\'] but it was not found',
    code: 'InvalidChangeBatch',
    time: Thu Oct 30 2014 18:57:35 GMT-0700 (PDT),
    statusCode: 400,
    retryable: false },
  '1': null }


3 tests complete (3585 ms)

api$
*/