'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');

var dock = require('./fixtures/dock');
var generateKey = require('./fixtures/key-factory');



describe('/actions/kill', function () {
  var ctx = {};

  before(function (done) {
    ctx.api = require('../app')();
    ctx.api.start(done);
  });
  after(function (done) {
    ctx.api.stop(function () {
      done(); // ignore errors.
    });
  });
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('kill server', function () {

    it('should fail without secret key', function (done) {
      var killUrl = 'http://localhost:' + process.env.PORT + '/actions/kill';
      var options = {
          method: 'POST',
          url: killUrl
      };
      request(options, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(403);
        done();
      });
    });

    it('should fail with wrong secret key', function (done) {
      var killUrl = 'http://localhost:' + process.env.PORT + '/actions/kill';
      var options = {
          method: 'POST',
          url: killUrl,
          headers: {
            'X-Runnable-Key': 'some-wrong-secret-key'
          }
      };
      request(options, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(403);
        done();
      });
    });

    it('should work if credentials are fine', function (done) {
      var killUrl = 'http://localhost:' + process.env.PORT + '/actions/kill';
      var options = {
          method: 'POST',
          url: killUrl,
          headers: {
            'X-Runnable-Key': process.env.SECRET_API_KEY
          }
      };
      request(options, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(204);
        request.post(killUrl, function (err) {
          expect(err.code).to.equal('ECONNREFUSED');
          done();
        });
      });
    });
  });

});