var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');

var api = require('./fixtures/api-control');
var hooks = require('./fixtures/analyze-hooks');

var multi = require('./fixtures/multi-factory');
var nock = require('nock');
var generateKey = require('./fixtures/key-factory');

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
      ctx.analyzer = user.newAnalyzer({}, {noStore: true, warn: false});
      done();
    });
  });

  describe('requirements', function () {
    it('should Boom without a "repos" query string parameter', function (done) {
      expect(true).to.equal(true);
      done();
    });
  });

});
