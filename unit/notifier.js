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
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is ready to be deployed...';
      expect(text).to.equal(message);
      cb();
    };
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop'
        }
      ],
      build: {
        triggeredAction: {
          appCodeVersion: {
            commitLog: [{
              id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
              author: {
                username: 'podviaznikov'
              }
            }]
          }
        }
      }
    }];
    slack.notifyOnBuild(contextVersions, done);
  });

  it('should render proper text on slack.notifyOnInstance call', function (done) {
    var slack = new Slack({});
    slack.send = function (text, cb) {
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is deployed ...';
      expect(text).to.equal(message);
      cb();
    };
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop'
        }
      ],
      build: {
        triggeredAction: {
          appCodeVersion: {
            commitLog: [{
              id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
              author: {
                username: 'podviaznikov'
              }
            }]
          }
        }
      }
    }];
    slack.notifyOnInstance(contextVersions, done);
  });

  it('should render proper text on hipchat.notifyOnBuild call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, cb) {
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is ready to be deployed...';
      expect(text).to.equal(message);
      cb();
    };
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop'
        }
      ],
      build: {
        triggeredAction: {
          appCodeVersion: {
            commitLog: [{
              id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
              author: {
                username: 'podviaznikov'
              }
            }]
          }
        }
      }
    }];
    hipchat.notifyOnBuild(contextVersions, done);
  });

  it('should render proper text on hipchat.notifyOnInstance call', function (done) {
    var hipchat = new HipChat({});
    hipchat.send = function (text, cb) {
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is deployed ...';
      expect(text).to.equal(message);
      cb();
    };
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop'
        }
      ],
      build: {
        triggeredAction: {
          appCodeVersion: {
            commitLog: [{
              id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
              author: {
                username: 'podviaznikov'
              }
            }]
          }
        }
      }
    }];
    hipchat.notifyOnInstance(contextVersions, done);
  });

  it('should send message to HipChat', {timeout: 2000}, function (done) {
    var hipchat = new HipChat({authToken: 'a4bcd2c7007379398f5158d7785fa0', roomId: '1076330'});
    var randomUsername = 'podviaznikov' + new Date().getTime();
    var contextVersions = [{
      appCodeVersions: [
        {
          repo: 'api',
          branch: 'develop'
        }
      ],
      build: {
        triggeredAction: {
          appCodeVersion: {
            commitLog: [{
              id: 'a240edf982d467201845b3bf10ccbe16f6049ea9',
              author: {
                username: randomUsername
              }
            }]
          }
        }
      }
    }];
    hipchat.notifyOnInstance(contextVersions, function (err, status) {
      if (err) { return done(err); }
      console.log('status', status, randomUsername);
      var hc = new HipChatClient('388add7b19c83cc9f970d6b97a5642');
      setTimeout(function () {
        hc.api.rooms.history({
          room_id: '1076330',
          date: 'recent'
        }, function (err, resp) {
          if (err) { return done(err); }
          var messages = resp.messages;
          console.log('messages', messages);
          expect(messages.length).to.be.above(1);
          var properMessages = messages.filter(function (message) {
            return message.message.indexOf(randomUsername) > -1;
          });
          expect(properMessages.length).to.be.equal(1);
          messages.forEach(function (message) {
            expect(message.from.name).to.equal(process.env.HIPCHAT_BOT_USERNAME);
          });
          done();
        });
      }, 200);
    });
  });
});