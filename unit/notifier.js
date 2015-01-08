'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var Notifier = require('models/notifications/notifier');
var Slack = require('models/notifications/slack');
var HipChat = require('models/notifications/hipchat');
var HipChatClient = require('hipchat-client');

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
      var message = 'podviaznikov\'s latest push to api@develop is now runnable.\n';
      message += 'There is 1 commit in this push.\n';
      message += 'Choose a Box to run develop.';
      expect(text).to.equal(message);
      cb();
    };
    var commitLog = [{
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: {
        username: 'podviaznikov'
      }
    }];
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop',
          commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      ]
    }];
    slack.notifyOnBuild(commitLog, contextVersions, done);
  });

  it('should render proper text on slack.notifyOnInstances call', function (done) {
    var slack = new Slack({});
    slack.send = function (text, cb) {
      var message = 'podviaznikov\'s latest push to api@develop is now runnable.\n';
      message += 'There are 2 commits in this push.\n';
      message += 'The change is deployed on\n http://runnable.io/podviaznikov/instance1\n';
      expect(text).to.equal(message);
      cb();
    };
    var commitLog = [{
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: {
        username: 'podviaznikov'
      }
    },
    {
      id: 'b240edf982d467201845b3bf10bbbe16f6049eb1',
      author: {
        username: 'tjmehta'
      }
    }];
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop',
          commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      ]
    }];
    var instances = [
      {
        name: 'instance1',
        owner: {
          username: 'podviaznikov'
        }
      }
    ];
    slack.notifyOnInstances(commitLog, contextVersions, instances, done);
  });

  it('should render proper text on hipchat.notifyOnBuild call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, cb) {
      var message = 'podviaznikov\'s latest push to api@develop is now runnable.\n';
      message += 'There is 1 commit in this push.\n';
      message += 'Choose a Box to run develop.';
      expect(text).to.equal(message);
      cb();
    };
    var commitLog = [{
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: {
        username: 'podviaznikov'
      }
    }];
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop',
          commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      ]
    }];
    hipchat.notifyOnBuild(commitLog, contextVersions, done);
  });

  it('should render proper text on hipchat.notifyOnInstances call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, cb) {
      var message = 'podviaznikov\'s latest push to api@develop is now runnable.\n';
      message += 'There is 1 commit in this push.\n';
      message += 'The change is deployed on\n ';
      message += '<a href="http://runnable.io/podviaznikov/instance1">instance1</a>\n ';
      message += '<a href="http://runnable.io/podviaznikov/instance2">instance2</a>\n';
      expect(text).to.equal(message);
      cb();
    };
    var commitLog = [{
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: {
        username: 'podviaznikov'
      }
    }];
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop',
          commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      ]
    }];
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
    hipchat.notifyOnInstances(commitLog, contextVersions, instances, done);
  });

  it('should send message to HipChat', {timeout: 4000}, function (done) {
    var hipchat = new HipChat({authToken: 'a4bcd2c7007379398f5158d7785fa0', roomId: '1076330'});
    var randomUsername = 'user' + new Date().getTime();
    var commitLog = [{
      id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
      author: {
        username: randomUsername
      }
    }];
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop',
          commit: 'a240edf982d467201845b3bf10ccbe16f6049ea9'
        }
      ]
    }];
    var instances = [
      {
        name: 'instance1',
        owner: {
          username: 'podviaznikov'
        }
      }
    ];
    hipchat.notifyOnInstances(commitLog, contextVersions, instances, function (err) {
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
      }, 200);
    });
  });
});
