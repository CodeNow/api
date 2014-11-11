'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var redis = require('models/redis');
var createCount = require('callback-count');

var request = require('request');

describe('GET /status', function () {
  var ctx = {};
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user;
      done(err);
    });
  });
  beforeEach(function (done) {
    redis.del(process.env.RUNNABLE_STATUS_KEY, done);
  });

  describe('good', function () {
    it('should return empty status with no key in redis', function (done) {
      request.get(process.env.FULL_API_DOMAIN + '/status', function (err, res) {
        if (err) { return done(err); }
        var d = JSON.parse(res.body);
        expect(err).to.be.not.okay;
        expect(Object.keys(d).length).to.equal(0);
        done();
      });
    });
  });
  describe('bad', function () {
    describe('with one key', function () {
      beforeEach(function (done) {
        redis.hset(process.env.RUNNABLE_STATUS_KEY, 'message', 'hello test', done);
      });
      it('should return error message that is in redis', function (done) {
        request.get(process.env.FULL_API_DOMAIN + '/status', function (err, res) {
          if (err) { return done(err); }
          var d = JSON.parse(res.body);
          expect(err).to.be.not.okay;
          expect(Object.keys(d).length).to.equal(1);
          expect(d.message).to.be.okay;
          expect(d.message).to.match(/hello test/);
          done();
        });
      });
    });
    describe('with multiple keys including status code', function () {
      beforeEach(function (done) {
        var count = createCount(3, done);
        redis.hset(process.env.RUNNABLE_STATUS_KEY, 'message', 'hello test', count.next);
        redis.hset(process.env.RUNNABLE_STATUS_KEY, 'statusCode', '202', count.next);
        redis.hset(process.env.RUNNABLE_STATUS_KEY, 'helpText', 'yell at TJ', count.next);
      });
      it('should return all the information', function (done) {
        request.get(process.env.FULL_API_DOMAIN + '/status', function (err, res) {
          if (err) { return done(err); }
          var d = JSON.parse(res.body);
          expect(err).to.be.not.okay;
          expect(res.statusCode).to.equal(202);
          expect(Object.keys(d).length).to.equal(3);
          expect(d.message).to.be.okay;
          expect(d.statusCode).to.be.okay;
          expect(d.helpText).to.be.okay;
          expect(d.message).to.match(/hello test/);
          expect(d.statusCode).to.match(/202/);
          expect(d.helpText).to.match(/yell at TJ/);
          done();
        });
      });
    });
  });
});
