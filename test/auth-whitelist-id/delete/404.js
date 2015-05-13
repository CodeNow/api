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
describe('DELETE /auth/whitelist/:name - 404', function () {
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  beforeEach(function (done) {
    ctx.j = request.jar();
    require('../../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user;
      done(err);
    });
  });
  beforeEach(function (done) {
    ctx.name = ''+Date.now();
    var opts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist',
      json: true,
      body: { name: ctx.name },
      jar: ctx.j
    };
    require('../../fixtures/mocks/github/user-memberships-org').isMember(
      ctx.user.attrs.accounts.github.id,
      ctx.user.attrs.accounts.github.username,
      'Runnable');
    request(opts, done);
  });
  afterEach(require('../../fixtures/clean-mongo').removeEverything);

  it('should not remove a name if the user making the request is not authorized', function (done) {
    require('../../fixtures/mocks/github/user-memberships-org').notMember(
      ctx.user.attrs.accounts.github.id,
      ctx.user.attrs.accounts.github.username,
      'Runnable');
    var opts = {
      method: 'DELETE',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/' + uuid(),
      json: true,
      jar: ctx.j
    };
    request(opts, function (err, res, body) {
      expect(err).to.be.null();
      expect(res).to.exist();
      expect(res.statusCode).to.equal(404);
      expect(body.error).to.match(/^not found$/i);
      expect(body.message).to.match(/not a member of org/);
      require('../../fixtures/check-whitelist')([ctx.name], done);
    });
  });

  it('should not remove a name that is not there', function (done) {
    require('../../fixtures/mocks/github/user-memberships-org').isMember(
      ctx.user.attrs.accounts.github.id,
      ctx.user.attrs.accounts.github.username,
      'Runnable');
    var opts = {
      method: 'DELETE',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/' + uuid(),
      json: true,
      jar: ctx.j
    };
    request(opts, function (err, res, body) {
      expect(err).to.be.null();
      expect(res).to.exist();
      expect(res.statusCode).to.equal(404);
      expect(body.error).to.match(/not found/i);
      expect(body.message).to.match(/userwhitelist not found/i);
      require('../../fixtures/check-whitelist')([ctx.name], done);
    });
  });
});

