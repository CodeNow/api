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
var uuid = require('uuid');

var ctx = {};
describe('POST /auth/whitelist', function () {
  before(function (done) {
    process.env.ENABLE_USER_WHITELIST = true;
    done();
  });
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(function (done) {
    delete process.env.ENABLE_USER_WHITELIST;
    done();
  });
  beforeEach(function (done) {
    ctx.name = uuid();
    done();
  });
  afterEach(require('../../fixtures/clean-mongo').removeEverything);

  it('should add a name to the whitelist', function (done) {
    var opts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist',
      json: true,
      body: { name: ctx.name }
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

