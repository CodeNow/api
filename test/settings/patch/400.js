'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');

describe('400 PATCH /settings/:id', {timeout:500}, function () {
  var ctx = {};
  before(api.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));


  describe('update settings', function () {

    it('should fail updating non-existing setting', function (done) {
      var runnable = multi.createUser(function (err) {
        if (err) { return done(err); }
        var settings = {
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394',
              githubUsernameToSlackIdMap: {}
            },
            hipchat: {
              authToken: 'some-hipchat-token',
              roomId: 123123
            }
          }
        };

        require('../../fixtures/mocks/github/user-orgs')(runnable);
        require('../../fixtures/mocks/github/users-username')(runnable.attrs.accounts.github.id,
          runnable.attrs.accounts.github.username);

          runnable.newSetting('000000000000000000000000').update({json: settings}, function (err) {

          expect(err.data.statusCode).to.equal(404);
          expect(err.data.message).to.equal('Setting not found');
          done();
        });
      });
    });
  });
});