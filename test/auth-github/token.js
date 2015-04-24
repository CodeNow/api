'use strict';
require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;
var after = lab.after;
var before = lab.before;
var beforeEach = lab.beforeEach;

var request = require('request');

var api = require('../fixtures/api-control');
var url = require('url');
var querystring = require('querystring');
var uuid = require('uuid');

describe('/auth/github with whitelist', function () {
  var ctx = {};
  var baseUrl = 'http://' + process.env.ROOT_DOMAIN + '/auth/github/';
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  describe('user not in the whitelist', function () {
    var tokenUrl = baseUrl + 'token';
    beforeEach(function (done) {
      ctx.username = uuid();
      ctx.testToken = uuid();
      done();
    });

    it('should not let the user authenticate', function (done) {
      require('../fixtures/mocks/github/user')(1000, ctx.username, ctx.testToken);
      require('../fixtures/mocks/github/user-emails')();
      require('../fixtures/mocks/github/user-orgs')(1001, uuid());
      request.post({
        url: tokenUrl,
        json: true,
        body: { accessToken: ctx.testToken },
        qs: { username: ctx.username },
        followRedirect: false
      }, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(302);
        var qs = querystring.parse(url.parse(res.headers.location).query);
        expect(qs).to.contain({ whitelist: 'false' });
        done();
      });
    });
  });

  describe('user in the whitelist', function () {
    var tokenUrl = baseUrl + 'token';
    before(function (done) {
      ctx.username = uuid();
      ctx.testToken = uuid();
      var Whitelist = require('models/mongo/user-whitelist');
      var w = new Whitelist({
        name: ctx.username,
        allowed: true
      });
      w.save(done);
    });

    it('should let the user authenticate', function (done) {
      require('../fixtures/mocks/github/user')(1000, ctx.username, ctx.testToken);
      require('../fixtures/mocks/github/user-emails')();
      require('../fixtures/mocks/github/user-orgs')(1001, uuid());
      request.post({
        url: tokenUrl,
        json: true,
        body: { accessToken: ctx.testToken },
        qs: { username: ctx.username },
        followRedirect: false
      }, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('user in an org in the whitelist', function () {
    var tokenUrl = baseUrl + 'token';
    before(function (done) {
      ctx.orgname = uuid();
      ctx.username = uuid();
      ctx.testToken = uuid();
      var Whitelist = require('models/mongo/user-whitelist');
      var w = new Whitelist({
        name: ctx.orgname,
        allowed: true
      });
      w.save(done);
    });

    it('should let the user authenticate', function (done) {
      require('../fixtures/mocks/github/user')(1000, ctx.username, ctx.testToken);
      require('../fixtures/mocks/github/user-emails')();
      require('../fixtures/mocks/github/user-orgs')(1001, ctx.orgname);
      request.post({
        url: tokenUrl,
        json: true,
        body: { accessToken: ctx.testToken },
        qs: { username: ctx.orgname },
        followRedirect: false
      }, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(200);
        done();
      });
    });
  });
});
