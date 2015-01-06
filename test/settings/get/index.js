'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var expect = Lab.expect;
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');


describe('GET /settings', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);


  describe('create and get', function () {
    var settings = {
      owner: {},
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
    before(function (done) {
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


    it('should be possible to fetch settings that were just created', function (done) {
      ctx.user.fetchSetting(settingsId, function (err, body) {
        if (err) { return done(err); }
        expect(body._id).to.exist();
        expect(body.owner.github).to.equal(settings.owner.github);
        expect(body.notifications.slack.webhookUrl).to.equal(settings.notifications.slack.webhookUrl);
        expect(body.notifications.hipchat.authToken).to.equal(settings.notifications.hipchat.authToken);
        expect(body.notifications.hipchat.roomId).to.equal(settings.notifications.hipchat.roomId);
        done();
      });
    });

    it('should fail if another user wanted to fetch settings without permissions', function (done) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.user);
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        runnable.fetchSetting(settingsId, function (err) {
          expect(err.output.payload.statusCode).to.equal(403);
          expect(err.output.payload.message).to.equal('Access denied (!owner)');
          done();
        });
      });
    });

    it('should return 404 for fake settings-id', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
        runnable.fetchSetting('507f1f77bcf86cd799439011', function (err) {
          expect(err.data.statusCode).to.equal(404);
          expect(err.data.message).to.equal('Setting not found');
          done();
        });
      });
    });

    it('should return 400 for non-objectId settings-id', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }

        runnable.fetchSetting('fake-id', function (err) {
          expect(err.data.statusCode).to.equal(400);
          expect(err.data.message).to.equal('url parameter \"id\" is not an ObjectId');
          done();
        });
      });
    });

  });

});