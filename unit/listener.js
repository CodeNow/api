require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var beforeEach = Lab.beforeEach;

var listener = require('../lib/events/listener.js');
var expect = Lab.expect;
var redis = require('models/redis').createClient();
var subscriber = require('models/redis').createClient();
var createCount = require('callback-count');

describe('event listener', function () {
    describe('onEvent', function () {
      var testData = {
        string: 'hi',
        object: {
          hello: 'test'
        },
        number: 124,
        bool: true
      };
      var key = 'runnable:test:event';

      beforeEach(function(done) {
        listener.removeAllListeners();
        done();
      });

      it('should callback with correct data on registered event', function (done) {
        listener.on(key, function(data) {
          expect(testData).to.deep.equal(data);
          done();
        });

        redis.publish(key, JSON.stringify(testData));
      });

      it('should callback with correct data on registered event with wildcard', function (done) {
        var globKey = 'runnable:test:*';
        listener.on(globKey, function(data) {
          expect(testData).to.deep.equal(data);
          done();
        });

        redis.publish(key, JSON.stringify(testData));
      });

      it('should not callback', function (done) {
        var globKey = 'runnable:fake:test:*';
        listener.on(globKey, function() {
          done(new Error('should not have called this'));
        });
        subscriber.psubscribe(key);
        subscriber.on('pmessage', function () {
          done();
        });

        redis.publish(key, JSON.stringify(testData));
      });

      it('should callback all functions', function (done) {
        var count = createCount(2, done);
        var globKey = 'runnable:test:*';
        listener.on(key, function(data) {
          expect(testData).to.deep.equal(data);
          count.next();
        });
        listener.on(globKey, function(data) {
          expect(testData).to.deep.equal(data);
          count.next();
        });
        listener.on('fake', function() {
          done(new Error('should not have called this'));
        });
        listener.on('runnable:', function() {
          done(new Error('should not have called this'));
        });

        redis.publish(key, JSON.stringify(testData));
      });
  }); // onEvent
}); // event listener