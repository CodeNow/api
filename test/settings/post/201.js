'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');


describe('201 POST /settings', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);


  describe('create new settings', function () {

    it('should be possible to create settings', function (done) {
      multi.createRunnableClient(function (err, runnable) {
        if (err) { return done(err); }
        // NOTE: I don't have this in runnable-api-client yet. That is why such hacky test
        runnable.client.request.post(runnable.host + '/settings', {owner: {github: 1}}, function (err, resp, body) {
          if (err) { return done(err); }
          console.log('seetings:', body, resp.status);
          done();
        });
      });
    });

  });

});