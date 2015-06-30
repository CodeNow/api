'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var api = require('../../fixtures/api-control');

var request = require('request');
var randStr = require('randomstring').generate;

var ctx = {};
describe('POST /auth/whitelist', function () {
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(function (done) {
    ctx.name = randStr(5);
    done();
  });
  before(function (done) {
    ctx.j = request.jar();
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user;
      done(err);
    });
  });
  afterEach(require('../../fixtures/clean-mongo').removeEverything);

  it('should add a name to the whitelist', function (done) {
    require('../../fixtures/mocks/github/user-orgs')(2828361, 'Runnable');
    var opts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist',
      json: true,
      body: { name: ctx.name },
      jar: ctx.j
    };
    request(opts, function (err, res, body) {
      expect(err).to.be.null();
      expect(res).to.exist();
      expect(res.statusCode).to.equal(201);
      expect(body).to.deep.contain({
        name: ctx.name,
        lowerName: ctx.name.toLowerCase(),
        allowed: true
      });
      require('../../fixtures/check-whitelist')([ctx.name], done);
    });
  });
});
