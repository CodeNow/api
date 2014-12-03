'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var generateKey = require('./fixtures/key-factory');



describe('/actions/kill', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('kill server', function () {
    it('should return OKAY', function (done) {
      var killUrl = 'http://localhost:' + process.env.PORT + '/actions/kill';
      request.post(killUrl, function (err, res) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(204);
        request.post(killUrl, function (err) {
          expect(err.code).to.equal('ECONNREFUSED');
          done();
        });
      });
    });
  });

});