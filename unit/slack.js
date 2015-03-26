'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

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

});
