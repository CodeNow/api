'use strict';
require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
// var afterEach = Lab.afterEach;

var expect = Lab.expect;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
// var multi = require('./fixtures/multi-factory');

var createCount = require('callback-count');

var events = require('models/events/docker');
// var RedisFlag = require('models/redis/flags');
var redis = require('models/redis');

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

  beforeEach(redisCleaner);
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('./fixtures/mocks/api-client').clean);


  describe('docker container die', function () {


    // describe('started instance case', {timeout: 400}, function () {
    //   beforeEach(function (done) {
    //     multi.createContainer(function (err, container, instance, build) {
    //       if (err) { return done(err); }
    //       ctx.build = build;
    //       ctx.instance = instance;
    //       ctx.container = container;
    //       ctx.build = build;
    //       expect(instance.attrs.container.inspect.State.Running).to.equal(true);
    //       done();
    //     });
    //   });

    //   afterEach(require('./fixtures/clean-ctx')(ctx));
    //   afterEach(require('./fixtures/clean-nock'));
    //   afterEach(require('./fixtures/clean-mongo').removeEverything);

    //   it('should stop instance if die event received', function (done) {
    //     console.log('11', ctx.container);
    //     var eventData = {id: ctx.container.attrs.inspect.Id, ip: '192.0.0.1', time: new Date().getTime()};
    //     events.handleContainerDie(eventData, function (err, newInstanceState) {
    //       console.log('asdasdasd')
    //       if (err) { return done(err); }
    //       expect(newInstanceState.container.inspect.State.Running).to.equal(false);
    //       done();
    //     });
    //   });

    // //   // it('should try to stop stopped instance without error', function (done) {
    // //   //   ctx.instance.stop(function (err) {
    // //   //     if (err) { return done(err); }
    // //   //     ctx.instance.fetch(function (err, instance) {
    // //   //       if (err) { return done(err); }
    // //   //       expect(instance.container.inspect.State.Running).to.equal(false);
    // //   //       var eventData = {id: ctx.container.attrs.inspect.Id, ip: '192.0.0.1', time: new Date().getTime()};
    // //   //       events.handleContainerDie(eventData, function (err) {
    // //   //         if (err) { return done(err); }
    // //   //         ctx.instance.fetch(function (err, newInstanceState) {
    // //   //           if (err) { return done(err); }
    // //   //           expect(newInstanceState.container.inspect.State.Running).to.equal(false);
    // //   //           done();
    // //   //         });
    // //   //       });
    // //   //     });
    // //   //   });
    // //   // });

    //  });


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