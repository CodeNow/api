'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var Code = require('code');
var expect = Code.expect;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');

describe('400 PATCH /settings/:id', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  describe('update settings', function () {

    var settings = {
      owner: {
        github: 13
      },
      notifications: {
        slack: {
          webhookUrl: 'http://slack.com/some-web-hook-url'
        },
        hipchat: {
          authToken: 'some-hipchat-token',
          roomId: 123123
        }
      }
    };

    var settingsId = null;

    beforeEach(function (done) {
      // NOTE(anton): is this correct?
      require('../../fixtures/mocks/github/user-orgs')(13, 'some-org');
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }

        runnable.createSetting({json: settings}, function (err, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          settingsId = body._id;
          done();
        });
      });
    });

    it('should fail updating non-existing setting', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        var settings = {
          notifications: {
            slack: {
              webhookUrl: 'http://slack.com/some-web-hook-url'
            },
            hipchat: {
              authToken: 'some-hipchat-token',
              roomId: 123123
            }
          }
        };
        runnable.newSetting('507f1f77bcf86cd799439011').update({json: settings}, function (err) {
          expect(err.data.statusCode).to.equal(404);
          expect(err.data.message).to.equal('Setting not found');
          done();
        });
      });
    });

  });

});
