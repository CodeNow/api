'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var pubsub = require('models/redis/pubsub');
var dockerEvents = require('models/events');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');

require('loadenv')();




describe('Docker Events', function () {

  describe('listen', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));

    it('should not be possible to process event with the same uuid twice', function (done) {
      dockerEvents.listen(function (err) {
        expect(err).to.be.null();
      });
      dockerEvents.listen(function (err) {
        expect(err.output.statusCode).to.equal(409);
        expect(err.output.payload.message).to.equal('Event is currently being updated by another API host.');
        done();
      });
      var payload = {
        uuid: 1,
        ip: '192.0.0.1',
        host: 'http://localhost:4243',
        from: 'ubuntu:base',
        id: '05a8615e0886',
        time: new Date().getTime()
      };
      pubsub.publish('runnable:docker:die', payload);
    });

  });

});