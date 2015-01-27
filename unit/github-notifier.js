'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var GitHub = require('models/notifications/github');
var uuid = require('uuid');

describe('GitHub Notifier',  function () {


  it('should render proper text for PR comment if no runnable boxes found', function (done) {
    var github = new GitHub();

    var githubPushInfo = {
      repo: 'CodeNow/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      user: {
        login: 'podviaznikov'
      },
      owner: {
        login: 'podviaznikov'
      }
    };

    var message = github._renderMessage(githubPushInfo, []);
    expect(message).to.equal('[Select Runnable server to run code from this PR](http://runnable3.net/podviaznikov/boxSelection/api/develop/commit/a240edf982d467201845b3bf10ccbe16f6049ea9)\n');
    done();
  });


});