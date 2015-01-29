'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;

var GitHub = require('models/apis/github');

describe('GitHub API', function () {


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


});