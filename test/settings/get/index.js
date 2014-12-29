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
      owner: {
        github: 1
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

    before(function (done) {
      multi.createRunnableClient(function (err, runnable) {
        if (err) { return done(err); }
        // NOTE: I don't have this in runnable-api-client yet. That is why such hacky test

        runnable.client.request.post(runnable.host + '/settings', {json: settings}, function (err, resp, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          settingsId = body._id;
          done();
        });
      });
    });




    it('should be possible to fetch settings that were just created', function (done) {
      multi.createRunnableClient(function (err, runnable) {
        if (err) { return done(err); }
        // NOTE: I don't have this in runnable-api-client yet. That is why such hacky test

        runnable.client.request.get(runnable.host + '/settings/' + settingsId, function (err, resp, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          expect(body.owner.github).to.equal(1);
          expect(body.notifications.slack.webhookUrl).to.equal(settings.notifications.slack.webhookUrl);
          expect(body.notifications.hipchat.authToken).to.equal(settings.notifications.hipchat.authToken);
          expect(body.notifications.hipchat.roomId).to.equal(settings.notifications.hipchat.roomId);
          done();
        });
      });
    });

  });

});