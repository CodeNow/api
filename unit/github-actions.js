'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var githubActions = require('routes/actions/github');



describe('GitHub Actions', function () {

  describe('parseGitHubPushData', function () {

    it('should return error if req.body.repository not found', function (done) {
      var req = {
        body: {}
      };
      var res = {};
      githubActions.parseGitHubPushData(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected commit hook format. Repository is required');
        done();
      });
    });

    it('should return error if req.body.head_commit not found', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode'
        }
      };
      var res = {};
      githubActions.parseGitHubPushData(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected commit hook format. Head commit is required');
        done();
      });
    });

    it('should return error if req.body.ref not found', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode',
          head_commit: {}
        }
      };
      var res = {};
      githubActions.parseGitHubPushData(req, res, function (err) {
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('Unexpected commit hook format. Ref is required');
        done();
      });
    });

    it('should parse branch and default to [] for commmitLog', function (done) {
      var req = {
        body: {
          repository: 'podviaznikov/hellonode',
          ref: 'refs/heads/feature-1',
          head_commit: {}
        }
      };
      var res = {};
      githubActions.parseGitHubPushData(req, res, function (err) {
        if (err) { return done(err); }
        expect(req.githubPushInfo.branch).to.equal('feature-1');
        expect(req.githubPushInfo.commitLog.length).to.equal(0);
        done();
      });
    });

  });

});