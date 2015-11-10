'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var before = lab.before;
var after = lab.after;
var beforeEach = lab.beforeEach;
//var afterEach = lab.afterEach;

var async = require('async');
var Code = require('code');
var expect = Code.expect;
var assign = require('101/assign');
var request = require('request');
var randStr = require('randomstring').generate;

var api = require('./fixtures/api-control');
var ctx = {
  githubUserId: 1,
  orgName: 'CodeNow'
};

describe('TeammateInvitation', function () {

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(function (done) {
    ctx.name = randStr(5);
    done();
  });
  before(function (done) {
    ctx.j = request.jar();
    require('./fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user;
      done(err);
    });
  });
  after(function (done) {
    require('./fixtures/clean-mongo').removeEverything();
    done();
  });

  function getOpts (obj) {
    return assign({
      url: process.env.FULL_API_DOMAIN + '/teammate-invitation/',
      json: true,
      jar: ctx.j
    }, obj);
  }

  describe('POST /teammate-invitation', function () {
    it('should create a new invitation', function (done) {
      var opts = {
         orgName: ctx.orgName,
         email: ctx.user.attrs.email,
         createdBy: ctx.user.attrs._id,
         githubUserId: ctx.githubUserId
      };
      request.post(getOpts({ qs: opts, body: opts }), function (err, res) {
        expect(res.statusCode).to.equal(201);
        expect(res.body).to.be.an.object();
        expect(res.body.githubUserId).to.equal(ctx.githubUserId);
        expect(res.body.email).to.equal(ctx.user.attrs.email);
        expect(res.body.orgName).to.equal(ctx.orgName);
        expect(res.body.createdBy).to.equal(ctx.user.attrs._id);
        done();
      });
    });
  });

  describe('GET /teammate-invitation/:orgName', function () {
    it('should get no results for an org that has no invitations', function (done) {
      var url = process.env.FULL_API_DOMAIN + '/teammate-invitation/CodeNowNoInvitations';
      request.get(getOpts({ url: url }), function (err, res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.an.array();
        expect(res.body.length).to.equal(0);
        done();
      });
    });

    it('should get the results for an org that has invitations', function (done) {
      var url = process.env.FULL_API_DOMAIN + '/teammate-invitation/' + ctx.orgName;
      request.get(getOpts({ url: url }), function (err, res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.be.an.array();
        expect(res.body.length).to.equal(1);
        expect(res.body[0]).to.be.an.object();
        expect(res.body[0].githubUserId).to.equal(ctx.githubUserId);
        expect(res.body[0].email).to.equal(ctx.user.attrs.email);
        expect(res.body[0].orgName).to.equal(ctx.orgName);
        expect(res.body[0].createdBy).to.equal(ctx.user.attrs._id);
        done();
      });
    });
  });

  describe('DELETE /teammate-invitation/:orgName', function () {

    it('should delete invitations from the database', function (done) {
      var orgUrl = process.env.FULL_API_DOMAIN + '/teammate-invitation/' + ctx.orgName;
      async.waterfall([function (cb) {
        request.get(getOpts({ url: orgUrl }), cb);
      }, function (response, result, cb) {
        expect(response.body).to.be.an.array();
        expect(response.body.length).to.equal(1);
        expect(response.body[0]._id).to.be.a.string();
        var url = process.env.FULL_API_DOMAIN + '/teammate-invitation/' + response.body[0]._id;
        return request.del(getOpts({ url: url }), cb);
      }, function (response, result, cb) {
        console.log(response.statusCode);
        console.log(response.body);
        request.get(getOpts({ url: orgUrl }), cb);
      }, function (response, result, cb) {
        console.log(response.statusCode);
        console.log(response.body);
        expect(result).to.be.an.array();
        expect(result.length).to.equal(0);
        cb();
      }], function (err) {
         console.log('err', err);
         done(err);
      });

    });

  });

});
