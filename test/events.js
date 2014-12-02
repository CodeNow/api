'use strict';
require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;

var expect = Lab.expect;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');

var createCount = require('callback-count');

var events = require('models/events/docker');
var RedisFlag = require('models/redis/flags');
var redis = require('models/redis');
var Docker = require('models/apis/docker');

var redisCleaner = function (cb) {

  redis.keys('*', function (err, keys) {
    if (err) {
      return cb(err);
    }
    if (keys.length === 0) {
      return cb();
    }

    var count = createCount(cb);
    keys.forEach(function (key) {
      redis.del(key, count.inc().next);
    });
  });
};

describe('Events handler', function () {
  var ctx = {};

  before(redisCleaner);
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('./fixtures/mocks/api-client').clean);


  describe('docker container die',  {timeout: 2000}, function () {


    afterEach(require('./fixtures/clean-ctx')(ctx));
    afterEach(require('./fixtures/clean-nock'));
    afterEach(require('./fixtures/clean-mongo').removeEverything);

    it('should fail if die-flag is set to ignore', function (done) {
      multi.createContainer(function (err, container, instance) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.container = container;
        expect(instance.attrs.container.inspect.State.Running).to.equal(true);
        var flag = new RedisFlag();
        var eventData = {id: ctx.container.attrs.inspect.Id, ip: '192.0.0.1', time: new Date().getTime()};
        flag.set(ctx.container.attrs.inspect.Id, '-die-flag', 'ignore', function (err) {
          if (err) { return done(err); }
          events.handleContainerDie(eventData, function (err) {
            expect(err.output.statusCode).to.equal(409);
            flag.get(ctx.container.attrs.inspect.Id, '-die-flag', function (err, flag) {
              if (err) { return done(err); }
              expect(flag).to.be.null();
              done();
            });
          });
        });
      });
    });

    it('should stop instance if die event received', function (done) {
      multi.createContainer(function (err, container, instance) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.container = container;
        var docker = new Docker('http://localhost:4243');
        docker.stopContainer({dockerContainer: ctx.container.attrs.inspect.Id}, function (err) {
          if (err) { return done(err); }
          var eventData = {id: ctx.container.attrs.inspect.Id, ip: 'localhost', time: new Date().getTime()};
          events.handleContainerDie(eventData, function (err, newInstanceState) {
            if (err) { return done(err); }
            expect(newInstanceState.container.inspect.State.Running).to.equal(false);
            expect(newInstanceState.container.inspect.State.Pid).to.equal(0);
            done();
          });
        });
      });
    });



    it('should fail if event data has no id', function (done) {
      events.handleContainerDie({ip: '192.0.0.1'}, function (err) {
        expect(err.message).to.equal('Invalid data: id is missing');
        done();
      });
    });

    it('should fail if event data has no time', function (done) {
      events.handleContainerDie({id: 'duasiduia213'}, function (err) {
        expect(err.message).to.equal('Invalid data: time is missing');
        done();
      });
    });

    it('should fail if event data has no ip', function (done) {
      events.handleContainerDie({id: 'duasiduia213', time: new Date().getTime() }, function (err) {
        expect(err.message).to.equal('Invalid data: ip is missing');
        done();
      });
    });

    it('should fail if time does not exist', function (done) {
      events.handleContainerDie({id: 'duasiduia213', ip: '192.0.0.1'}, function (err) {
        expect(err.message).to.equal('Invalid data: time is missing');
        done();
      });
    });

  });

  // describe('docker daemon down', function () {


  //   describe('started instance case', function () {
  //     beforeEach(function (done) {
  //       multi.createContainer(function (err, container, instance, build) {
  //         if (err) { return done(err); }
  //         ctx.build = build;
  //         ctx.instance = instance;
  //         ctx.container = container;
  //         ctx.build = build;
  //         expect(instance.attrs.container.inspect.State.Running).to.equal(true);
  //         done();
  //       });
  //     });

  //     afterEach(require('./fixtures/clean-ctx')(ctx));
  //     afterEach(require('./fixtures/clean-nock'));
  //     afterEach(require('./fixtures/clean-mongo').removeEverything);

  //     it('should stop instances if docker down event received', function (done) {
  //       events.handleDockerDaemonDown({ip: ctx.instance.attrs.container.dockerHost}, function (err) {
  //         if (err) { return done(err); }
  //         ctx.instance.fetch(function (err, newInstanceState) {
  //           if (err) { return done(err); }
  //           expect(newInstanceState.container.inspect.State.Running).to.equal(false);
  //           done();
  //         });
  //       });
  //     });

  //     it('should try to stop stopped instance without error', function (done) {
  //       ctx.instance.stop(function (err) {
  //         if (err) { return done(err); }
  //         ctx.instance.fetch(function (err, instance) {
  //           if (err) { return done(err); }
  //           expect(instance.container.inspect.State.Running).to.equal(false);
  //           events.handleDockerDaemonDown({ip: ctx.instance.attrs.container.dockerHost}, function (err) {
  //             if (err) { return done(err); }
  //             ctx.instance.fetch(function (err, newInstanceState) {
  //               if (err) { return done(err); }
  //               expect(newInstanceState.container.inspect.State.Running).to.equal(false);
  //               done();
  //             });
  //           });
  //         });
  //       });
  //     });

  //   });



  //   it('should fail if event data has no ip', function (done) {
  //     events.handleDockerDaemonDown({id: 'duasiduia213'}, function (err) {
  //       expect(err.message).to.equal('Invalid data: ip is missing');
  //       done();
  //     });
  //   });

  // });


});