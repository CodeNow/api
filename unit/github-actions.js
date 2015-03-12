'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var githubActions = require('routes/actions/github');



describe('GitHub Actions', function () {

  describe('parseGitHubPullRequest', function () {

    it('should return error if req.body.repository not found', function (done) {
      var req = {
        body: {}
      };
      var res = {};
      githubActions.parseGitHubPullRequest(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected PR hook format. Repository is required');
        done();
      });
    });

    it('should return error if req.body.pull_request not found', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode'
        }
      };
      var res = {};
      githubActions.parseGitHubPullRequest(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected PR hook format. Pull Request is required');
        done();
      });
    });

    it('should return error if req.body.pull_request.head not found', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode',
          pull_request: {}
        }
      };
      var res = {};
      githubActions.parseGitHubPullRequest(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected PR hook format. Pull Request head is required');
        done();
      });
    });


    it('should default org to {}', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode',
          pull_request: {
            head: {}
          },
        }
      };
      var res = {};
      githubActions.parseGitHubPullRequest(req, res, function (err) {
        if (err) { return done(err); }
        expect(Object.keys(req.githubPullRequest.org).length).to.equal(0);
        done();
      });
    });

  });

});