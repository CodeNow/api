'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var GitHub = require('models/apis/github');
var repoMock = require('../test/fixtures/mocks/github/repo');
var isCollaboratorMock =
  require('../test/fixtures/mocks/github/repos-username-repo-collaborators-collaborator');

var userMembershipMock =
  require('../test/fixtures/mocks/github/user-memberships-org');

var prsMock =
  require('../test/fixtures/mocks/github/repos-username-repo-pulls');

describe('GitHub API', function () {


  describe('listOpenPullRequestsForBranch', function () {

    it('should get one pr branch', function (done) {
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      prsMock.openPulls('podviaznikov', 'hellonode', 'test');
      github.listOpenPullRequestsForBranch('podviaznikov/hellonode', 'test', function (err, prs) {
        if (err) { return done(err); }
        expect(prs.length).to.equal(1);
        expect(prs[0].head.ref).to.equal('test');
        done();
      });
    });

    it('should get 0 prs for master branch', function (done) {
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      prsMock.openPulls('podviaznikov', 'hellonode', 'test');
      github.listOpenPullRequestsForBranch('podviaznikov/hellonode', 'master', function (err, prs) {
        if (err) { return done(err); }
        expect(prs.length).to.equal(0);
        done();
      });
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


  describe('isOrgMember', function () {

    it('should return true if user is an org members', function (done) {
      userMembershipMock.isMember(1, 'runnabot', 'CodeNow');
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      github.isOrgMember('CodeNow', function (err, isMember) {
        if (err) { return done(err); }
        expect(isMember).to.be.true();
        done();
      });
    });

    it('should return false if user is a pending org member', function (done) {
      userMembershipMock.pendingMember(2, 'runnabot', 'Runnable');
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      github.isOrgMember('Runnable', function (err, isMember) {
        if (err) { return done(err); }
        expect(isMember).to.be.false();
        done();
      });
    });

    it('should return false if user is not an org member', function (done) {
      userMembershipMock.notMember(3, 'runnabot', 'hashobject');
      var github = new GitHub({token: process.env.RUNNABOT_GITHUB_ACCESS_TOKEN});
      github.isOrgMember('hashobject', function (err, isMember) {
        if (err) { return done(err); }
        expect(isMember).to.be.false();
        done();
      });
    });

  });




});
