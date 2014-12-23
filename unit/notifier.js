'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var Notifier = require('models/notifications/notifier');

describe('Notifier', function () {

  it('should throw an error name was not provided', function (done) {
    try {
      var slack = new Notifier();
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
      done(new Error('should throw an error'));
    } catch (e) {
      expect(e.message).to.contain(['ENOENT, no such file or directory']);
      done();
    }
  });

  it('should render proper text on notifyOnBuild call', function (done) {
    var slack = new Notifier('slack', {});
    slack.send = function (text, cb) {
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is ready to be deployed...'
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

  it('should render proper text on notifyOnInstance call', function (done) {
    var slack = new Notifier('slack', {});
    slack.send = function (text, cb) {
      var message = 'podviaznikov latest push to api@develop is now runnable.\n';
      message += 'There are 1 commits in this push.\n';
      message += 'The change is deployed ...'
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
});