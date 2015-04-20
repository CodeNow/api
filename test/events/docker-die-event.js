'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var api = require('../fixtures/api-control');
var dock = require('../fixtures/dock');
var multi = require('../fixtures/multi-factory');
var primus = require('../fixtures/primus');
var dockerEvents = require('models/events/docker');
var Docker = require('models/apis/docker');
var createCount = require('callback-count');
var UserStoppedContainer = require('models/redis/user-stopped-container');

describe('EVENT runnable:docker:events:die', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../fixtures/mocks/api-client').clean);

  describe('container dies naturally', function() {

    beforeEach(function (done) {
      multi.createContainer(function (err, container, instance) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.container = container;
        expect(instance.attrs.container.inspect.State.Running).to.equal(true);
        done();
      });
    });
    describe('container die event handler', function() {
      beforeEach(function (done) {
        ctx.originalUserStoppedContainerUnLock = UserStoppedContainer.prototype.unlock;
        done();
      });
      afterEach(function (done) {
        UserStoppedContainer.prototype.unlock = ctx.originalUserStoppedContainerUnLock;
        done();
      });
      // beforeEach(dockerEvents.close.bind(dockerEvents));

      it('should receive the docker die event', function (done) {
        var count = createCount(2, done);
        dockerEvents.on('die', handler);
        var docker = new Docker(ctx.instance.attrs.container.dockerHost);
        docker.stopContainer(ctx.instance.attrs.container, count.next);
        function handler (data) {
          if (data.from === 'ubuntu:latest') { // ignore image-builder dies
            expect(data.status).to.equal('die');
            expect(data.from).to.equal('ubuntu:latest');
            expect(data.id).to.equal(ctx.instance.attrs.container.inspect.Id);
            dockerEvents.removeListener('die', handler);
            count.next();
          }
        }
      });

      it('should update instance state in the mongo', function (done) {
        var count = createCount(2, done);
        var userStoppedContainer = new UserStoppedContainer(ctx.instance.attrs.container.inspect.Id);
        UserStoppedContainer.prototype.unlock = function (cb) {
          ctx.originalUserStoppedContainerUnLock.bind(userStoppedContainer)(function (err, success) {
            ctx.instance.fetch(function (err, instance) {
              if (err) { return done(err); }
              expect(instance.container.inspect.State.Running).to.equal(false);
              expect(instance.container.inspect.State.Pid).to.equal(0);
              cb(err, success);
              count.next();
            });
          });
        };
        var docker = new Docker(ctx.instance.attrs.container.dockerHost);
        docker.stopContainer(ctx.instance.attrs.container, count.next);
      });

    });

    describe('user stops the instance\'s container', {timeout: 2000}, function() {
      beforeEach(function (done) {
        ctx.origHandleDieGetEventLock = dockerEvents.getEventLock;
        ctx.originalUserStoppedContainerLock = UserStoppedContainer.prototype.lock;
        done();
      });
      afterEach(function (done) {
        dockerEvents.getEventLock = ctx.origHandleDieGetEventLock;
        UserStoppedContainer.prototype.lock = ctx.originalUserStoppedContainerLock;
        done();
      });

      it('should receive the docker die event', function (done) {
        var count = createCount(2, done);
        function handler (data) {
          if (data.from === 'ubuntu:latest') { // ignore image-builder dies
            expect(data.id).to.equal(ctx.instance.attrs.container.inspect.Id);
            expect(data.status).to.equal('die');
            expect(data.from).to.equal('ubuntu:latest');
            dockerEvents.removeListener('die', handler);
            count.next();
          }
        }
        dockerEvents.on('die', handler);
        ctx.instance.stop(count.next);
      });

      it('should acquire event lock', function (done) {
        var count = createCount(2, done);
        dockerEvents.getEventLock = function (eventId) {
          expect(eventId).to.exist();
          count.next();
        };
        ctx.instance.stop(count.next);
      });

      it('should acquire user stopped container lock on user action', function (done) {
        var count = createCount(3, done);
        var userStoppedContainer = new UserStoppedContainer(ctx.instance.attrs.container.inspect.Id);
        var lockCounter = 0;
        UserStoppedContainer.prototype.lock = function (cb) {
          ctx.originalUserStoppedContainerLock.bind(userStoppedContainer)(function (err, success) {
            if (lockCounter === 0) {
              expect(success).to.equal(true); // user
              count.next();
            }
            if (lockCounter === 1) {
              expect(success).to.equal(false); // die event, does not get lock
              count.next();
            }
            lockCounter++;
            cb(err, success);
          });
        };
        ctx.instance.stop(count.next);
      });
    });


  });
});
