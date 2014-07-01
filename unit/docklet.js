var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var redis = require('models/redis');

var async = require('async');
var Docklet = require('../lib/models/apis/docklet.js');
var createCount = require('callback-count');

describe('Docklet', function () {
  beforeEach(function (done) {
    this.docklet = new Docklet();
    async.series([
      redis.del.bind(redis, 'docks:active'),
      redis.del.bind(redis, 'docks:10.0.1.20'),
      redis.del.bind(redis, 'docks:10.0.1.21'),
      redis.del.bind(redis, 'docks:10.0.1.22'),
    ], done);
  });
  afterEach(function (done) {
    delete this.docklet;
    async.series([
      redis.del.bind(redis, 'docks:active'),
      redis.del.bind(redis, 'docks:10.0.1.20'),
      redis.del.bind(redis, 'docks:10.0.1.21'),
      redis.del.bind(redis, 'docks:10.0.1.22'),
    ], done);
  });

  it('should find inserted dock from redis', function (done) {
    var count = createCount(2, done);
    redis.lpush("docks:active", "10.0.1.20", count.next);
    this.docklet.findDock(function(err, dockerHost) {
      expect(dockerHost).to.equal("10.0.1.20");
      count.next();
    });
  });

  it('should error if no dock', function (done) {
    this.docklet.findDock(function(err) {
      expect(err.message).to.equal('no active docks in redis');
      done();
    });
  });

  it('should return same IP for same dock instance', function (done) {
    async.series([
      redis.lpush.bind(redis, "docks:active", "10.0.1.21"),
      redis.lpush.bind(redis, "docks:active", "10.0.1.22"),
      findAndExpectDock(this.docklet, '10.0.1.22'),
      findAndExpectDock(this.docklet, '10.0.1.22')
    ], done);
  });

  it('should cycle though docks', function (done) {
    async.series([
      redis.lpush.bind(redis, "docks:active", "10.0.1.21"),
      redis.lpush.bind(redis, "docks:active", "10.0.1.22"),
      findAndExpectDock(this.docklet, '10.0.1.22'),
      findAndExpectDock(new Docklet(), '10.0.1.21'),
      findAndExpectDock(new Docklet(), '10.0.1.22')
    ], done);
  });

  function findAndExpectDock (docklet, ip) {
    return function (cb) {
      docklet.findDock(function(err, dockerHost) {
        if (err) { return cb(err); }
        expect(dockerHost).to.equal(ip);
        cb();
      });
    };
  }
});
