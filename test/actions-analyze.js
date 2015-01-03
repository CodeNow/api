var Lab = require('lab');
var after = Lab.after;
var afterEach = Lab.afterEach;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var describe = Lab.experiment;
var expect = Lab.expect;
var it = Lab.test;

var api = require('./fixtures/api-control');
var generateKey = require('./fixtures/key-factory');
var hooks = require('./fixtures/analyze-hooks');
var multi = require('./fixtures/multi-factory');
var nock = require('nock');
var request = require('request');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Analyze - /actions/analyze', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user;
      done();
    });
  });

  describe('requirements', function () {
    it('should return 400 code without a "repo" query parameter', function (done) {
      ctx.user.client.request.get(
        hooks.getErrorNoQueryParam,
        function (err, res, body) {
          expect(res.statusCode).to.equal(400);
          expect(res.body.message).to.equal('query parameter "repo" must be a string');
          done();
      });
    });
  });

});
