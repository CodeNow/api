var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');

// var Build = require('models/mongo/build');
// var ContextVersion = require('models/mongo/context-version');
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
// var tailBuildStream = require('./fixtures/tail-build-stream');
// var not = require('101/not');
// var exists = require('101/exists');
// var expects = require('./fixtures/expects');
// var equals = require('101/equals');
var nock = require('nock');
var generateKey = require('./fixtures/key-factory');
// var createCount = require('callback-count');

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
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

});
