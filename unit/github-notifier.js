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
        }
      };

      var message = github._renderMessage(githubPushInfo, []);
      var msg = '[Choose a server]';
      msg += '(http://runnable3.net/podviaznikov/boxSelection/';
      msg += 'api/fix%252F1/commit/a240edf982d467201845b3bf10ccbe16f6049ea9)';
      msg += ' to run PR-2';
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
        }
      };
      var instances = [
        {
          name: 'box-1'
        },
        {
          name: 'box-2'
        }
      ];
      var message = github._renderMessage(githubPushInfo, instances);
      var msg = '[Server box-1](http://runnable3.net/podviaznikov/box-1)\n  ';
      msg += '[Server box-2](http://runnable3.net/podviaznikov/box-2)';
      expect(message).to.equal(msg);
      done();
    });

  });

  describe('_newMessageForLinkedBox', function () {

    it('should update replace old box selection text', function (done) {
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
        }
      };

      var oldMessage = github._renderMessage(githubPushInfo, []);
      var instance = {name: 'new-box', owner: {username: 'podviaznikov'}};
      var newMessage = github._newMessageForLinkedBox(githubPushInfo, oldMessage, instance);
      var expected = '[Server new-box](http://runnable3.net/podviaznikov/new-box)';
      expect(newMessage).to.equal(expected);
      done();
    });

    it('should update add new server box link', function (done) {
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
        }
      };
      var instances = [
        {
          name: 'box-1'
        }
      ];
      var oldMessage = github._renderMessage(githubPushInfo, instances);

      var instance = {name: 'new-box', owner: {username: 'podviaznikov'}};
      var newMessage = github._newMessageForLinkedBox(githubPushInfo, oldMessage, instance);
      var expected = '[Server box-1](http://runnable3.net/podviaznikov/box-1)\n';
      expected += '[Server new-box](http://runnable3.net/podviaznikov/new-box)';
      expect(newMessage).to.equal(expected);
      done();
    });

  });

  describe('_newMessageForUnlinkedBox', function () {


    it('should replace all with selection link', function (done) {
      var github = new GitHub();

      var githubPushInfo = {
        repo: 'CodeNow/api',
        repoName: 'api',
        branch: 'fix/1',
        commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        number: 3,
        user: {
          login: 'podviaznikov'
        },
        owner: {
          login: 'podviaznikov'
        }
      };
      var instances = [
        {
          name: 'box-1',
          owner: {
            username: 'podviaznikov'
          }
        }
      ];
      var oldMessage = github._renderMessage(githubPushInfo, instances);

      var instance = {name: 'box-1', owner: {username: 'podviaznikov'}};
      var newMessage = github._newMessageForUnlinkedBox(githubPushInfo, oldMessage, instance);
      var expected = '[Choose a server]';
      expected += '(http://runnable3.net/podviaznikov/boxSelection/api/fix%252F1/';
      expected += 'commit/a240edf982d467201845b3bf10ccbe16f6049ea9)';
      expected += ' to run PR-3';
      expect(newMessage).to.equal(expected);
      done();
    });

    it('should remove server box url', function (done) {
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
        }
      };
      var instances = [
        {
          name: 'box-1',
          owner: {
            username: 'podviaznikov'
          }
        },
        {
          name: 'box-2',
          owner: {
            username: 'podviaznikov'
          }
        }
      ];
      var oldMessage = github._renderMessage(githubPushInfo, instances);

      var instance = {name: 'box-1', owner: {username: 'podviaznikov'}};
      var newMessage = github._newMessageForUnlinkedBox(githubPushInfo, oldMessage, instance);
      var expected = '[Server box-2](http://runnable3.net/podviaznikov/box-2)';
      expect(newMessage).to.equal(expected);
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