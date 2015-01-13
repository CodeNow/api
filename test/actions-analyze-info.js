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
var hooks = require('./fixtures/analyze-info-hooks');
var multi = require('./fixtures/multi-factory');
var nock = require('nock');

var supportedLanguageVersionsNode = require('../lib/routes/actions/analyze/data/supported-language-versions-nodejs');
var supportedLanguageVersionsPython = require('../lib/routes/actions/analyze/data/supported-language-versions-python');
var supportedLanguageVersionsRuby = require('../lib/routes/actions/analyze/data/supported-language-versions-ruby');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Analyze - /actions/analyze/info', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user;
      ctx.request = user.client.request;
      done();
    });
  });
  afterEach(require('./fixtures/clean-ctx')(ctx));

  it('returns formatted language support information', function (done) {
    ctx.request.get(
      hooks.getSuccess,
      function (err, res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.an('object');
        expect(res.body.supportedLanguageVersions).to.be.an('object');
        expect(res.body.supportedLanguageVersions.node).to.be.an('array');
        expect(res.body.supportedLanguageVersions.ruby).to.be.an('array');
        expect(res.body.supportedLanguageVersions.python).to.be.an('array');
        done();
      }
    );
  });
});
