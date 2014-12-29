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
var typesTests = require('../../fixtures/types-test-util');

describe('400 POST /settings', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);


  describe('create new settings', function () {

    it('should not create setting without an owner', function (done) {
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
        runnable.createSetting({json: settings}, function (err) {
          expect(err.data.statusCode).to.equal(400);
          expect(err.data.message).to.equal('Owner is mandatory');
          done();
        });
      });
    });


    it('should not be possible to create settings for the same owner twice', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err); }
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
        runnable.createSetting({json: settings}, function (err, body) {
          if (err) { return done(err); }
          expect(body._id).to.exist();
          expect(body.owner.github).to.equal(1);
          expect(body.notifications.slack.webhookUrl).to.equal(settings.notifications.slack.webhookUrl);
          expect(body.notifications.hipchat.authToken).to.equal(settings.notifications.hipchat.authToken);
          expect(body.notifications.hipchat.roomId).to.equal(settings.notifications.hipchat.roomId);
          runnable.createSetting({json: settings}, function (err) {
            expect(err.data.statusCode).to.equal(409);
            expect(err.data.error).to.equal('Conflict');
            expect(err.data.message).to.equal('setting with owner already exists');
            done();
          });
        });
      });
    });


    describe('invalid types', function () {
      var def = {
        action: 'create a setting',
        requiredParams: [
          {
            name: 'owner',
            type: 'object',
            keys: [
              {
                name: 'github',
                type: 'number'
              }
            ]
          }
        ]
      };

      typesTests.makeTestFromDef(def, ctx, function(body, cb) {
        multi.createUser(function (err, runnable) {
          if (err) { return cb(err); }
          runnable.createSetting({json: body}, cb);
        });
      });
    });


  });

});