var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var generateKey = require('./fixtures/key-factory');
var createCount = require('callback-count');
var concat = require('concat-stream');
var zlib = require('zlib');

describe('Github Proxy', function () {
  var ctx = {};
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user;
      done(err);
    });
  });

  describe('/user', function () {
    beforeEach(function (done) {
      var count = createCount(2, done);
      require('./fixtures/mocks/github/user-gzip')(ctx.user, null, null, count.next);
      ctx.user.fetch(function (err) { count.next(err); });
    });
    it('should return the current user', function (done) {
      var r = ctx.user.client.get('/github/user');
      r.pipe(zlib.createGunzip()).pipe(concat(function (body) {
        body = JSON.parse(body.toString());
        expect(body).to.be.okay;
        expect(body.login).to.equal(ctx.user.json().accounts.github.username);
        done();
      }));
    });
  });
});
