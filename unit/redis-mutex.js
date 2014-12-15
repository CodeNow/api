var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;


var RedisMutex = require('models/redis/mutex');


describe('RedisMutex', function () {


  describe('lock', function () {

    it('should lock', function (done) {
      var mutex = new RedisMutex('key-1');
      mutex.lock(function (err, success) {
        if (err) { return done(err); }
        expect(success).to.equal(true);
        done();
      });
    });

    it('should fail to lock with the same key', function (done) {
      var mutex = new RedisMutex('key-1');
      mutex.lock(function (err, success) {
        if (err) { return done(err); }
        expect(success).to.equal(false);
        done();
      });
    });

    describe('unlock', function () {

      it('should be able to lock after unlock', function (done) {
        var mutex = new RedisMutex('key-1');
        mutex.unlock(function (err, success) {
          if (err) { return done(err); }
          expect(success).to.equal('1');
          mutex.lock(function (err, success) {
            if (err) { return done(err); }
            expect(success).to.equal(true);
            done();
          });
        });
      });

    });

  });


});
