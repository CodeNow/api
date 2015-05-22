var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var sinon = require('sinon');
var error = require('error');
var expect = Code.expect;

var multi = require('./fixtures/multi-factory');
var api = require('./fixtures/api-control');

describe('Errors', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(function (done) {
    ctx.LOG_ERRORS = process.env.LOG_ERRORS; // cache orig value
    process.env.LOG_ERRORS = false; // avoid error.log spam
    ctx.user = multi.createUser(done);
  });
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(function (done) {
    process.env.LOG_ERRORS = ctx.LOG_ERRORS; // restore orig value
    done();
  });

  describe('GET /test/errors/runtime', function () {
    it('should respond the error', function (done) {
      ctx.user.client.get('test/errors/runtime', function (err, res, body) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(500);
        expect(body.message).to.equal('An internal server error occurred');
        ctx.user.client.get('/', done); // make sure server is still up
      });
    });
  });

  describe('GET /test/errors/runtime/background', function () {
    beforeEach(function (done) {
      sinon.spy(error, 'errorHandler');
      done();
    });
    afterEach(function (done) {
      clearInterval(ctx.wait);// cleanup even on failure
      error.errorHandler.restore();
      done();
    });

    it('should respond the error', function (done) {

      ctx.user.client.get('test/errors/runtime/background', function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(200);
        waitForErrorHandlerCall(function () {
          ctx.user.client.get('/', done); // make sure server is still up
        });
      });
      function waitForErrorHandlerCall (cb) {
        ctx.wait = setInterval(function () {
          if (error.errorHandler.calledOnce) {
            clearInterval(ctx.wait);
            cb();
          }
        }, 5);// time must be longer than timeout in route
      }
    });
  });

  describe('GET /test/errors/next/boom', function () {
    it('should respond the error', function (done) {
      ctx.user.client.get('test/errors/next/boom', function (err, res, body) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(400);
        expect(body.message).to.equal('next error');
        done();
      });
    });
  });

  describe('GET /test/errors/next/unknown', function () {
    it('should respond the error', function (done) {
      ctx.user.client.get('test/errors/next/unknown', function (err, res, body) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(500);
        expect(body.message).to.equal('An internal server error occurred');
        ctx.user.client.get('/', done); // make sure server is still up
      });
    });
  });
});
