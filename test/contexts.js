var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var exists = require('101/exists');

describe('Context - /contexts', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.user = multi.createUser(done);
  });

  var required = {
    name: uuid()
  };
  it('should create a context with a name', function (done) {
    var expected = {
      name: required.name,
      lowerName: required.name.toLowerCase(),
      created: exists,
      'owner.github': ctx.user.attrs.accounts.github.id
    };
    ctx.user.createContext(required, expects.success(201, expected, done));
  });
  it('should not create a context if missing name', function (done) {
    ctx.user.createContext({}, expects.error(400, /name/, done));
  });
});
