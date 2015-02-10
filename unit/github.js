'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var after = Lab.after;
var before = Lab.before;
var beforeEach = Lab.beforeEach;

var api = require('../test/fixtures/api-control');
var multi = require('../test/fixtures/multi-factory');
var GitHub = require('models/apis/github');
var repoMock = require('../test/fixtures/mocks/github/repo');
var isCollaboratorMock =
  require('../test/fixtures/mocks/github/repos-username-repo-collaborators-collaborator');

describe('GitHub API', function () {
  var ctx = {};


  describe('listOpenPullRequestsForBranch', function () {

    it('should get one pr branch', function (done) {
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      github.listOpenPullRequestsForBranch('podviaznikov/hellonode', 'test', function (err, prs) {
        if (err) { return done(err); }
        expect(prs.length).to.equal(1);
        expect(prs[0].head.ref).to.equal('test');
        done();
      });
    });

    it('should get 0 prs for master branch', function (done) {
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      github.listOpenPullRequestsForBranch('podviaznikov/hellonode', 'master', function (err, prs) {
        if (err) { return done(err); }
        expect(prs.length).to.equal(0);
        done();
      });
    });
  });


  describe('mocked API', function () {

    before(api.start.bind(ctx));
    after(api.stop.bind(ctx));
    before(require('../test/fixtures/mocks/api-client').setup);
    after(require('../test/fixtures/mocks/api-client').clean);
    beforeEach(function (done) {
      multi.createUser(function (err, user) {
        ctx.user = user;
        ctx.request = user.client.request;
        done();
      });
    });


    describe('isPublicRepo', function () {

      it('should return true for the public repo', function (done) {
        repoMock.standardRepo({});
        var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
        github.isPublicRepo('cflynn07/clubbingowl_brochure', function (err, isPublic) {
          if (err) { return done(err); }
          expect(isPublic).to.be.true();
          done();
        });
      });

      it('should return false for the private repo', function (done) {
        repoMock.privateRepo({});
        var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
        github.isPublicRepo('cflynn07/private_clubbingowl_brochure', function (err, isPublic) {
          if (err) { return done(err); }
          expect(isPublic).to.be.false();
          done();
        });
      });

    });

    describe('isCollaborator', function () {

      it('should return true if user is collaborator', function (done) {
        isCollaboratorMock.isCollaborator('podviaznikov', 'hellonode', 'runnabot');
        var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
        github.isCollaborator('podviaznikov/hellonode', 'runnabot', function (err, isCollaborator) {
          if (err) { return done(err); }
          expect(isCollaborator).to.be.true();
          done();
        });
      });

      it('should return false if user is not collaborator', function (done) {
        isCollaboratorMock.notCollaborator('podviaznikov', 'hellonode', 'tj');
        var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
        github.isCollaborator('podviaznikov/hellonode', 'tj', function (err, isCollaborator) {
          if (err) { return done(err); }
          expect(isCollaborator).to.be.false();
          done();
        });
      });

    });

  });


});