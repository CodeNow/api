'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var expect = Lab.expect;
var GitHub = require('models/notifications/github');


describe('GitHub Notifier',  function () {

  describe('_renderMessage', function () {

    it('should render proper text for PR comment if no runnable boxes found', function (done) {
      var github = new GitHub();

      var githubPushInfo = {
        repo: 'CodeNow/api',
        repoName: 'api',
        number: 2,
        branch: 'fix/1',
        commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        user: {
          login: 'podviaznikov'
        },
        owner: {
          login: 'podviaznikov'
        },
        headCommit: {
          id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
          message: 'hey there',
          url: 'https://github.com/Runnable/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      };

      var message = github._renderMessage(githubPushInfo, []);
      var msg = '[Choose a server]';
      msg += '(http://runnable3.net/podviaznikov/boxSelection/';
      msg += 'api/fix%252F1/hey%2520there/a240edf982d467201845b3bf10ccbe16f6049ea9)';
      msg += ' to run PR-2.';
      expect(message).to.equal(msg);
      done();
    });


    it('should render proper text for PR comment if 2 runnable boxes found', function (done) {
      var github = new GitHub();

      var githubPushInfo = {
        repo: 'CodeNow/api',
        repoName: 'api',
        branch: 'fix/1',
        commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        user: {
          login: 'podviaznikov'
        },
        owner: {
          login: 'podviaznikov'
        },
        number: 5
      };
      var instances = [
        {
          name: 'box-1',
          owner: {
            login: 'podviaznikov'
          }
        },
        {
          name: 'box-2',
          owner: {
            login: 'podviaznikov'
          }
        }
      ];
      var message = github._renderMessage(githubPushInfo, instances);
      var msg = '[box-1](http://runnable3.net/podviaznikov/box-1) and ';
      msg += '[box-2](http://runnable3.net/podviaznikov/box-2)';
      msg += ' are updated with the latest changes to PR-5.';
      expect(message).to.equal(msg);
      done();
    });

  });

  describe('disabled PR comments', function () {
    var ctx = {};

    before(function (done) {
      ctx.originalENABLE_GITHUB_PR_COMMENTS = process.env.ENABLE_GITHUB_PR_COMMENTS;
      process.env.ENABLE_GITHUB_PR_COMMENTS = false;
      done();
    });

    after(function (done) {
      process.env.ENABLE_GITHUB_PR_COMMENTS = ctx.originalENABLE_GITHUB_PR_COMMENTS;
      done();
    });

    it('should not add new comment', function (done) {
      var github = new GitHub();
      github.notifyOnPullRequest({}, [], function (err, resp) {
        if (err) { return done(err); }
        expect(resp.length).to.equal(0);
        done();
      });
    });

    it('should not update comment', function (done) {
      var github = new GitHub();
      github.updatePullRequestsComments({}, {}, function (err, resp) {
        if (err) { return done(err); }
        expect(resp.length).to.equal(0);
        done();
      });
    });

  });

});