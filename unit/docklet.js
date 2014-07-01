var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var redis = require('models/redis');

var Docklet = require('../lib/models/apis/docklet.js');
var createCount = require('callback-count');

describe('Docklet', function () {
  beforeEach(function (done) {
    this.docklet = new Docklet();
    redis.del("docks:active", done);
  });
  afterEach(function (done) {
    delete this.docklet;
    redis.del("docks:active", done);
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
    var count = createCount(3, done);
    redis.lpush("docks:active", "10.0.1.21", count.next);
    redis.lpush("docks:active", "10.0.1.22", count.next);
    this.docklet.findDock(function(err, dockerHost) {
      if (err) {
        return done(err);
      }
      expect(dockerHost).to.equal("10.0.1.22");
      this.docklet.findDock(function(err, dockerHost) {
        if (err) {
          return done(err);
        }
        expect(dockerHost).to.equal("10.0.1.22");
        count.next();
      });
    });
  });

  it('should cycle though docks', function (done) {
    var count = createCount(3, done);
    redis.lpush("docks:active", "10.0.1.21", count.next);
    redis.lpush("docks:active", "10.0.1.22", count.next);
    this.docklet.findDock(function(err, dockerHost) {
      if (err) {
        return done(err);
      }
      expect(dockerHost).to.equal("10.0.1.22");
      var tmpDock = new Docklet();
      tmpDock.findDock(function(err, dockerHost) {
        if (err) {
          return done(err);
        }
        tmpDock = new Docklet();
        expect(dockerHost).to.equal("10.0.1.21");
        tmpDock.findDock(function(err, dockerHost) {
          if (err) {
            return done(err);
          }
          expect(dockerHost).to.equal("10.0.1.22");
          count.next();
        });
      });
    });
  });
});
