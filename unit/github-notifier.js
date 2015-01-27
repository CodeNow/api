'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var GitHub = require('models/notifications/github');


describe('GitHub Notifier',  function () {


  it('should render proper text for PR comment if no runnable boxes found', function (done) {
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

    var message = github._renderMessage(githubPushInfo, []);
    var msg = '[Select Runnable server to run code from this PR]';
    msg += '(http://runnable3.net/podviaznikov/boxSelection/';
    msg += 'api/fix%252F1/commit/a240edf982d467201845b3bf10ccbe16f6049ea9)\n';
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
    var msg = '  [Server box-1](http://runnable3.net/podviaznikov/box-1)\n  ';
    msg += '[Server box-2](http://runnable3.net/podviaznikov/box-2)\n';
    expect(message).to.equal(msg);
    done();
  });


});