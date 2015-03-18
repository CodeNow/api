'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
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
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));


  describe('update settings', function () {
    it('should fail updating non-existing setting', function (done) {
      multi.createUser(function (err, user) {
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
        user.newSetting('507f1f77bcf86cd799439011').update({json: settings}, function (err) {
          expect(err.data.statusCode).to.equal(404);
          expect(err.data.message).to.equal('Setting not found');
          done();
        });
      });
    });
  });
});