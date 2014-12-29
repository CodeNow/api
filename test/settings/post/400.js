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
      multi.createRunnableClient(function (err, runnable) {
        if (err) { return done(err); }
        // NOTE: I don't have this in runnable-api-client yet. That is why such hacky test
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
        runnable.client.request.post(runnable.host + '/settings', {json: settings}, function (err, resp, body) {
          if (err) { return done(err); }
          expect(body.statusCode).to.equal(400);
          expect(body.message).to.equal('Owner is mandatory');
          done();
        });
      });
    });

  });

});