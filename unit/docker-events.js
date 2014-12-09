'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var pubsub = require('models/redis/pubsub');
var dockerEvents = require('models/events/docker');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');
var createCount = require('callback-count');
var uuid = require('uuid');

require('loadenv')();




describe('Docker Events', function () {
  var ctx = {};

  describe('listen', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));
    afterEach(function (done) {
      dockerEvents.close(done);
    });
    it('should start listening and callback', function (done) {
      dockerEvents.listen(done);
    });
    describe('listen twice', function () {
      beforeEach(function (done) {
        dockerEvents.listen(done);
      });
      it('should callback an error', function (done) {
        dockerEvents.listen(done);
      });
    });

    // it('should not be possible to process event with the same uuid twice', function (done) {
    //   dockerEvents.listen();
    //   dockerEvents.listen(function (err) {
    //     expect(err.output.statusCode).to.equal(409);
    //     expect(err.output.payload.message).to.equal('Event is being handled by another API host.');
    //     done();
    //   });
    //   var payload = {
    //     uuid: 1,
    //     ip: '192.0.0.1',
    //     host: 'http://localhost:4243',
    //     from: 'ubuntu:base',
    //     id: '05a8615e0886',
    //     time: new Date().getTime()
    //   };
    //   pubsub.publish('runnable:docker:die', payload);
    // });

  });

  describe('close', function () {
    describe('not listening', function () {
      it('should callback', function (done) {
        dockerEvents.close(done);
      });
    });
    describe('listening', function () {
      beforeEach(function (done) {
        dockerEvents.listen(done);
      });
      it('should callback', function (done) {
        dockerEvents.close(done);
      });
    });
    describe('while handling events', function () {
      beforeEach(function (done) {
        ctx.origHandleDie = dockerEvents.events.die;
        done();
      });
      afterEach(function (done) {
        dockerEvents.events.die = ctx.origHandleDie;
        done();
      });
      it('should wait for events to be handled and callback', function (done) {
        var count = createCount(2, done);
        // mock handle die
        dockerEvents.events.die = function simpleLockTimeoutUnlock () {
          dockerEvents.getEventLock(uuid(), function (err, mutex) {
            if (err) { return count.next(err); }
            setTimeout(function () {
              mutex.unlock(count.next);
            }, 50);
          });
          callClose();
        };
        dockerEvents.listen(function (err) {
          if (err) { return count.next(err); }
          // trigger die event
          pubsub.publish(process.env.DOCKER_EVENTS_NAMESPACE+'die', {});
        });
        // call close while outstanding events are occuring
        function callClose () {
          dockerEvents.close(function (err) {
            if (err) { return count.next(err); }
            expect(dockerEvents.eventLockCount).to.equal(0);
            count.next();
          });
          expect(dockerEvents.eventLockCount).to.equal(1);
        }
      });
    });
  });
});