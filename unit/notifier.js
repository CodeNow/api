'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var Notifier = require('models/notifications/notifier');
var Slack = require('models/notifications/slack');
var HipChat = require('models/notifications/hipchat');
var HipChatClient = require('hipchat-client');
var uuid = require('uuid');

describe('Notifier',  function () {

  it('should throw an error name was not provided', function (done) {
    try {
      var slack = new Notifier();
      slack.notifyOnBuild();
      done(new Error('should throw an error'));
    } catch (e) {
      expect(e.message).to.equal('Please provide name for the notifier');
      done();
    }
  });

  it('should throw an error if send was not implemented', function (done) {
    var slack = new Notifier('slack', {});
    var sendMethod = slack.send.bind(slack, 'some-text');
    expect(sendMethod).to.throw(Error, 'Not implemented');
    done();
  });

  it('should throw an error if tpls were not found', function (done) {
    try {
      var facebook = new Notifier('facebook', {});
      facebook.notifyOnBuild([]);
      done(new Error('should throw an error'));
    } catch (e) {
      expect(e.message).to.contain(['ENOENT, no such file or directory']);
      done();
    }
  });

  it('should render proper text on slack.notifyOnBuild call', function (done) {
    var slack = new Slack({});
    slack.send = function (text, cb) {
      var message = 'podviaznikov\'s ';
      message += '<' + headCommit.url + '|changes>';
      message += ' (init me) to CodeNow/api (develop) are ready.\n';
      message += '<http://runnable3.net/';
      message += 'podviaznikov/boxSelection/api/develop/init%20me/a240edf982d467201845b3bf10ccbe16f6049ea9';
      message += '|Choose a server to run develop>.';
      expect(text).to.equal(message);
      cb();
    };

    var headCommit = {
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      message: 'init me',
      url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
    };
    var githubPushInfo = {
      commitLog: [headCommit],
      repo: 'CodeNow/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      headCommit: headCommit,
      user: {
        login: 'podviaznikov'
      },
      owner: {
        login: 'podviaznikov'
      }
    };

    slack.notifyOnBuild(githubPushInfo, done);
  });

  it('should render proper text on slack.notifyOnInstances call', function (done) {
    var slack = new Slack({});
    slack.send = function (text, instances, cb) {
      var message = 'tjmehta\'s ';
      message += '<' + headCommit.url + '|changes>';
      message += ' (init repo and  <https://github.com/CodeNow/api/compare/b240edf982d4...a240edf982d4|1 more>)';
      message += ' to CodeNow/api (develop) are deployed on servers:';
      expect(text).to.equal(message);
      cb();
    };
    var instances = [
      {
        name: 'instance1',
        owner: {
          username: 'podviaznikov'
        }
      }
    ];
    var headCommit = {
      id: 'b240edf982d467201845b3bf10bbbe16f6049eb1',
      message: 'init repo',
      url: 'https://github.com/CodeNow/api/commit/b240edf982d467201845b3bf10bbbe16f6049eb1'
    };
    var githubPushInfo = {
      commitLog: [headCommit,
        {
          id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
          author: {
            username: 'podviaznikov'
          }
        }],
      repo: 'CodeNow/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d46720,1845b3bf10ccbe16f6049ea9',
      headCommit: headCommit,
      user: {
        login: 'tjmehta'
      }
    };
    slack.notifyOnInstances(githubPushInfo, instances, done);
  });

  it('should render proper text on hipchat.notifyOnBuild call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, cb) {
      var message = 'podviaznikov\'s ';
      message += '<a href="' + headCommit.url + '">changes</a>';
      message += ' (hey there) to Runnable/api (develop) are ready.\n';
      message += '<a href="http://runnable3.net/podviaznikov/boxSelection/api/develop';
      message += '/hey%20there/a240edf982d467201845b3bf10ccbe16f6049ea9">Choose a server to run develop</a>.';
      expect(text).to.equal(message);
      cb();
    };
    var headCommit = {
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      message: 'hey there',
      url: 'https://github.com/Runnable/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
    };
    var githubPushInfo = {
      commitLog: [headCommit],
      repo: 'Runnable/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      headCommit: headCommit,
      user: {
        login: 'podviaznikov'
      },
      owner: {
        login: 'podviaznikov'
      }
    };
    hipchat.notifyOnBuild(githubPushInfo, done);
  });

  it('should render proper text on hipchat.notifyOnInstances call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, instances, cb) {
      var message = 'podviaznikov\'s ';
      message += '<a href="' + headCommit.url + '">changes</a>';
      message += ' (init) to CodeNow/api (develop) are deployed on servers:\n ';
      message += '<a href="http://runnable3.net/podviaznikov/instance1">instance1</a><br/>\n ';
      message += '<a href="http://runnable3.net/podviaznikov/instance2">instance2</a><br/>\n.\n';

      expect(text).to.equal(message);
      cb();
    };
    var headCommit = {
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      message: 'init',
      url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
    };
    var githubPushInfo = {
      commitLog: [headCommit],
      repo: 'CodeNow/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      headCommit: headCommit,
      user: {
        login: 'podviaznikov'
      }
    };
    var instances = [
      {
        name: 'instance1',
        owner: {
          username: 'podviaznikov'
        }
      },
      {
        name: 'instance2',
        owner: {
          username: 'podviaznikov'
        }
      }
    ];
    hipchat.notifyOnInstances(githubPushInfo, instances, done);
  });

  it('should send message to HipChat', {timeout: 2000}, function (done) {
    var hipchat = new HipChat({authToken: 'a4bcd2c7007379398f5158d7785fa0', roomId: '1076330'});
    var randomUsername = 'user' + uuid();
    var instances = [
      {
        name: 'instance1',
        owner: {
          username: 'podviaznikov'
        }
      }
    ];
    var headCommit = {
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: randomUsername,
      url: 'https://github.com/CodeNow/api/commit/a240edf982d467201845b3bf10ccbe16f6049ea9'
    };
    var githubPushInfo = {
      commitLog: [headCommit],
      repo: 'CodeNow/api',
      repoName: 'api',
      branch: 'develop',
      commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      headCommit: headCommit,
      user: {
        login: randomUsername
      }
    };
    hipchat.notifyOnInstances(githubPushInfo, instances, function (err) {
      if (err) { return done(err); }
      var hc = new HipChatClient('388add7b19c83cc9f970d6b97a5642');
      setTimeout(function () {
        hc.api.rooms.history({
          room_id: '1076330',
          date: 'recent'
        }, function (err, resp) {
          if (err) { return done(err); }
          var messages = resp.messages;
          expect(messages.length).to.be.above(1);
          var properMessages = messages.filter(function (message) {
            return message.message.indexOf(randomUsername) > -1;
          });
          expect(properMessages.length).to.be.equal(1);
          properMessages.forEach(function (message) {
            expect(message.from.name).to.equal(process.env.HIPCHAT_BOT_USERNAME);
          });
          done();
        });
      }, 800);
    });
  });
});
