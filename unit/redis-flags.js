'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var createCount = require('callback-count');
var redis = require('models/redis');
var RedisFlag = require('models/redis/flags');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');
require('loadenv')();



describe('Redis Flags', function () {

  describe('get', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));

    it('should return null for non-existing flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.be.null();
        done();
      });
    });

  });

  describe('set/get/del/get', function () {

    it('should save new flag', function (done) {
      var flag = new RedisFlag();
      flag.set('some-new-key', 'some-suffix', 'some-value', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('OK');
        done();
      });
    });

    it('should get just saved flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('some-value');
        done();
      });
    });

    it('should del flag', function (done) {
      var flag = new RedisFlag();
      flag.del('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('1');
        done();
      });
    });

    it('should get null for deleted flag', function (done) {
      var flag = new RedisFlag();
      flag.get('some-new-key', 'some-suffix', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.be.null();
        done();
      });
    });

  });

});