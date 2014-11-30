var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;

require('loadenv')();

var AWS = require('aws-sdk');
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

// TODO add assertions
describe('Route53 Unit Tests', function () {
  var mockRoute53 = require('../test/fixtures/route53');
  beforeEach(mockRoute53.start);
  afterEach(mockRoute53.reset);
  afterEach(mockRoute53.stop);

  describe('DELETE', function () {
    it('delete non existing', function (done) {
      var params = createParams('DELETE','mavis.codenow.runnable3.net', '10.0.0.0');
      var route53 = new AWS.Route53();
      route53.changeResourceRecordSets(params, function () {
        done();
      });
    });
    it('delete diffent domain', function (done){
      var params = createParams('DELETE','api.net', '10.0.0.0');
      var route53 = new AWS.Route53();
      route53.changeResourceRecordSets(params, function  () {
       done();
      });
    });
    it('delete valid entry', function (done){
      var params;
      params = createParams('UPSERT','anand.runnable3.net', '10.0.0.0');
      var route53 = new AWS.Route53();
      route53.changeResourceRecordSets(params, function () {
        params = createParams('DELETE','anand.runnable3.net', '10.0.0.0');
        route53.changeResourceRecordSets(params, function () {
          done();
        });
      });
    });
    it('delete valid with different data', function (done){
      var params;
      params = createParams('UPSERT','code.runnable3.net', '10.0.0.0');
      var route53 = new AWS.Route53();
      route53.changeResourceRecordSets(params, function () {
        params = createParams('DELETE','code.runnable3.net', '10.0.0.1');
        route53.changeResourceRecordSets(params, function () {
         done();
        });
     });
    });
  });

  process.env.DOMAIN = 'runnable3.net';
  describe('UPSERT', function () {
    var ctx = {};
    afterEach(function (done) {
      var params = createParams('DELETE', ctx.url, ctx.ip);
      var route53 = new AWS.Route53();
      route53.changeResourceRecordSets(params, function () {
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
          var route53 = new AWS.Route53();
          route53.changeResourceRecordSets(params, function () {
            done();
          });
        });
      });
      describe('twice', function () {
        beforeEach(function (done) {
          var params = createParams('UPSERT', ctx.url, ctx.ip);
          var route53 = new AWS.Route53();
          route53.changeResourceRecordSets(params, function () {
            done();
          });
        });
        it('should create the dns entry', function (done) {
          var params = createParams('UPSERT', ctx.url, ctx.ip);
          var route53 = new AWS.Route53();
          route53.changeResourceRecordSets(params, function () {
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
        var route53 = new AWS.Route53();
        route53.changeResourceRecordSets(params, function () {
          done();
        });
      });
    });
  });
});
