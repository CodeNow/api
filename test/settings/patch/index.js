'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');

describe('PATCH /settings/:id', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('create and get', function () {
    var settings = {
      owner: {},
      notifications: {
        slack: {
          apiToken: 'xoxo-dasjdkasjdk243248392482394',
          githubUsernameToSlackIdMap: {
            'cheese': 'U023BECGF'
          }
        },
        hipchat: {
          authToken: 'some-hipchat-token',
          roomId: 123123
        }
      }
    };

    var settingsId = null;
    beforeEach(function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        ctx.user = runnable;
        settings.owner.github = runnable.user.attrs.accounts.github.id;
        runnable.createSetting({json: settings}, function (err, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          settingsId = body._id;
          done();
        });
      });
    });

    it('should be possible to update just part of notifications settings', function (done) {
      var newSettings = {
        notifications: {
          slack: {
            apiToken: 'slack-token-2',
            githubUsernameToSlackIdMap: {
              'cheese': 'U023BECGG',
              'hello': 'U123BECGX'
            }
          }
        }
      };
      ctx.user.newSetting(settingsId).update({json: newSettings}, function (err, body) {
        if (err) { return done(err); }
        expect(body._id).to.exist();
        expect(body.owner.github).to.equal(settings.owner.github);
        expect(body.notifications.slack.apiToken).to.equal(
          newSettings.notifications.slack.apiToken
        );
        expect(body.notifications.slack.githubUsernameToSlackIdMap).to.deep.equal(
          newSettings.notifications.slack.githubUsernameToSlackIdMap
        );
        expect(body.notifications.hipchat.authToken).to.equal(
          settings.notifications.hipchat.authToken
        );
        expect(body.notifications.hipchat.roomId).to.equal(
          settings.notifications.hipchat.roomId
        );
        done();
      });
    });

    it('should be possible to update setting', function (done) {
      var newSettings = {
        notifications: {
          slack: {
            apiToken: 'xoxo-dasjdkasjdk243248392482394',
            githubUsernameToSlackIdMap: {
              'hello': 'operator'
            }
          },
          hipchat: {
            authToken: 'new-hipchat-token',
            roomId: 1231231
          }
        }
      };
      ctx.user.newSetting(settingsId).update({json: newSettings}, function (err, body) {
        if (err) { return done(err); }
        expect(body._id).to.exist();
        expect(body.owner.github).to.equal(settings.owner.github);

        expect(body.notifications.slack.apiToken).to.equal(
          newSettings.notifications.slack.apiToken
        );
        expect(body.notifications.slack.githubUsernameToSlackIdMap).to.deep.equal(
          newSettings.notifications.slack.githubUsernameToSlackIdMap
        );
        expect(body.notifications.hipchat.authToken).to.equal(
          newSettings.notifications.hipchat.authToken
        );
        expect(body.notifications.hipchat.roomId).to.equal(
          newSettings.notifications.hipchat.roomId
        );
        done();
      });
    });

    it('should be possible to remove setting', function (done) {
      var newSettings = {
        notifications: {
          slack: {
            apiToken: '',
            githubUsernameToSlackIdMap: {}

          },
          hipchat: {
            authToken: 'new-hipchat-token',
            roomId: 1231231
          }
        }
      };
      ctx.user.newSetting(settingsId).update({json: newSettings}, function (err, body) {
        if (err) { return done(err); }
        expect(body._id).to.exist();
        expect(body.owner.github).to.equal(settings.owner.github);

        expect(body.notifications.slack.apiToken).to.equal(
          newSettings.notifications.slack.apiToken
        );
        expect(body.notifications.slack.githubUsernameToSlackIdMap).to.be.undefined;
        expect(body.notifications.hipchat.authToken).to.equal(
          newSettings.notifications.hipchat.authToken
        );
        expect(body.notifications.hipchat.roomId).to.equal(
          newSettings.notifications.hipchat.roomId
        );
        done();
      });
    });


    it('should not be possible to update setting using the wrong user', function (done) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.user);
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        var newSettings = {
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394'
            },
            hipchat: {
              authToken: 'new-hipchat-token',
              roomId: 1231231
            }
          }
        };
        runnable.newSetting(settingsId).update({json: newSettings}, function (err) {
          expect(err.output.payload.statusCode).to.equal(403);
          expect(err.output.payload.message).to.equal('Access denied (!owner)');
          done();
        });
      });
    });


  });

});
