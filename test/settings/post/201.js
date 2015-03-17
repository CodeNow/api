'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var expect = Lab.expect;
var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');


describe('201 POST /settings', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);


  describe('create new settings', function () {

    it('should be possible to create settings with slack & hipchat', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        var settings = {
          owner: {
            github: runnable.user.attrs.accounts.github.id
          },
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394',
              usernameToSlackNameMap: {
                'cheese': 'danish'
              }
            },
            hipchat: {
              authToken: 'some-hipchat-token',
              roomId: 123123
            }
          }
        };
        runnable.createSetting({json: settings}, function (err, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          expect(body.owner.github).to.equal(runnable.user.attrs.accounts.github.id);

          expect(body.notifications.slack.apiToken).to.equal(
            settings.notifications.slack.apiToken
          );
          expect(body.notifications.slack.usernameToSlackNameMap).to.deep.equal(
            settings.notifications.slack.usernameToSlackNameMap
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
    });

  });

});