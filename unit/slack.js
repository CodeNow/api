'use strict';

require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var Slack = require('notifications/slack');

describe('Slack', function () {
  describe('#notifyOnAutoDeploy', function () {
    it('should do nothing if slack messaging is disabled', function (done) {
      var slack = new Slack();
      slack.notifyOnAutoDeploy({}, [], function (err, resp) {
        expect(err).to.equal(null);
        expect(resp).to.equal(undefined);
        done();
      });
    });
    it('should do nothing if slack messaging is disabled in settings', function (done) {
      var settings = {
        notifications: {
          slack: {
            enabled: false
          }
        }
      };
      var slack = new Slack(settings);
      slack.notifyOnAutoDeploy({}, [], function (err, resp) {
        expect(err).to.equal(null);
        expect(resp).to.equal(undefined);
        done();
      });
    });
  });

  describe('#_createAutoUpdateText', function () {
    it('should return text messages', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      };
      var commit2 = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        author: {
          username: 'podviaznikov'
        }
      };
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [ headCommit, commit2 ],
        repo: 'CodeNow/api',
        repoName: 'api'
      };
      var instances = [
        {
          name: 'server-1',
          owner: {
            github: 3213,
            username: 'CodeNow'
          }
        },
        {
          name: 'server-1-copy',
          owner: {
            github: 3213,
            username: 'CodeNow'
          }
        }
      ];
      var text = Slack.createAutoDeployText(gitInfo, instances);
      var expected = 'Your <http://localhost:3031/actions/redirect?';
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9';
      expected += '|changes> (init &amp; commit &amp; push long test   next line   3d... and ';
      expected += '<http://localhost:3031/actions/redirect?';
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcompare%2Fa240edf982d4...a240edf982d4|1 more>)';
      expected += ' to CodeNow/api (feature-1) are deployed on:';
      expected += '\n<https://runnable3.net/CodeNow/server-1?ref=slack|server-1>';
      expected += '\n<https://runnable3.net/CodeNow/server-1-copy?ref=slack|server-1-copy>';
      expect(text).to.equal(expected);
      done();
    });

    it('should return text if commitLog is []', function (done) {
      var headCommit = {
        id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
        message: 'init & commit & push long test \n next line \n 3d line',
        url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
      };
      var gitInfo = {
        branch: 'feature-1',
        headCommit: headCommit,
        commitLog: [],
        repo: 'CodeNow/api',
        repoName: 'api'
      };
      var instances = [
        {
          name: 'server-1',
          owner: {
            github: 3213,
            username: 'CodeNow'
          }
        },
        {
          name: 'server-1-copy',
          owner: {
            github: 3213,
            username: 'CodeNow'
          }
        }
      ];
      var text = Slack.createAutoDeployText(gitInfo, instances);
      var expected = 'Your <http://localhost:3031/actions/redirect?';
      expected += 'url=https%3A%2F%2Fgithub.com%2FCodeNow%2Fapi%2Fcommit%2Fa240edf982d467201845b3bf10ccbe16f6049ea9';
      expected += '|changes> (init &amp; commit &amp; push long test   next line   3d...)';
      expected += ' to CodeNow/api (feature-1) are deployed on:';
      expected += '\n<https://runnable3.net/CodeNow/server-1?ref=slack|server-1>';
      expected += '\n<https://runnable3.net/CodeNow/server-1-copy?ref=slack|server-1-copy>';
      expect(text).to.equal(expected);
      done();
    });
  });

});
