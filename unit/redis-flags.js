'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var RedisFlag = require('models/redis/flags');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');
require('loadenv')();



describe('Redis Flags', function () {

  describe('exists', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));

    it('should return null for non-existing flag', function (done) {
      var flag = new RedisFlag('some-ns', 'some-new-key');
      flag.exists(function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('0');
        done();
      });
    });

  });

  describe('set/exists/del/exists', function () {

    it('should save new flag', function (done) {
      var flag = new RedisFlag('some-ns', 'some-new-key');
      flag.set('some-value', function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('OK');
        done();
      });
    });

    it('should exists just saved flag', function (done) {
      var flag = new RedisFlag('some-ns', 'some-new-key');
      flag.exists(function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('1');
        done();
      });
    });

    it('should del flag', function (done) {
      var flag = new RedisFlag('some-ns', 'some-new-key');
      flag.del(function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('1');
        done();
      });
    });

    it('should exists null for deleted flag', function (done) {
      var flag = new RedisFlag('some-ns', 'some-new-key');
      flag.exists(function (err, value) {
        expect(err).to.be.null();
        expect(value).to.equal('0');
        done();
      });
    });

  });

});