'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var Slack = require('notifications/slack');

describe('Slack', function () {

  describe('#notifyOnNewBranch', function () {
    it('should do nothing if slack messaging is disabled', function (done) {
      var slack = new Slack();
      slack.notifyOnNewBranch({}, function (err, resp) {
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
      slack.notifyOnNewBranch({}, function (err, resp) {
        expect(err).to.equal(null);
        expect(resp).to.equal(undefined);
        done();
      });
    });
  });

  describe('#notifyOnAutoUpdate', function () {
    it('should do nothing if slack messaging is disabled', function (done) {
      var slack = new Slack();
      slack.notifyOnAutoUpdate({}, [], function (err, resp) {
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
      slack.notifyOnAutoUpdate({}, [], function (err, resp) {
        expect(err).to.equal(null);
        expect(resp).to.equal(undefined);
        done();
      });
    });
  });

  describe('#_createAutoUpdateText', function () {
    it('should return text messages', function (done) {
      var gitInfo = {
        branch: 'feature-1',
        headCommit: {
          message: 'first commit'
        }
      };
      var instances = [
        {
          name: 'server-1',
          owner: {
            github: 3213,
            username: 'podviaznikov'
          }
        },
        {
          name: 'server-1-copy',
          owner: {
            github: 3213,
            username: 'podviaznikov'
          }
        }
      ];
      var slack = new Slack({});
      var text = slack._createAutoUpdateText(gitInfo, instances);
      var expected = 'Your changes (first commit) to podviaznikov/server-1 (feature-1) are deployed on servers:\n';
      expected += '<https://runnable3.net/undefined/server-1|server-1>\n';
      expected += '<https://runnable3.net/undefined/server-1-copy|server-1-copy>';
      expect(text).to.equal(expected);
      done();
    });

  });

  describe('#_createServerSelectionUrl', function () {
    it('should return text messages', function (done) {
      var gitInfo = {
        branch: 'feature-1',
        repo: 'api',
        commit: '00000000000',
        headCommit: {
          message: 'first commit'
        }
      };
      var slack = new Slack({});
      var text = slack._createServerSelectionUrl('CodeNow', gitInfo);
      var expected = '<https://runnable3.net/CodeNow/serverSelection/undefined?branch=feature-1';
      expected += '&commit=00000000000&message=first%2520commit|Choose a server> to run feature-1 (api)';
      expect(text).to.equal(expected);
      done();
    });

  });

});