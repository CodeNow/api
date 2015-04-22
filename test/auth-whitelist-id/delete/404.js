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

var request = require('request');
var uuid = require('uuid');

var ctx = {};
describe('DELETE /auth/whitelist/:name - 404', function () {
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(function (done) {
    ctx.name = uuid();
    var opts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist',
      json: true,
      body: { name: ctx.name }
    };
    request(opts, done);
  });
  afterEach(require('../../fixtures/clean-mongo').removeEverything);

  it('should not remove a name that is not there', function (done) {
    var opts = {
      method: 'DELETE',
      url: process.env.FULL_API_DOMAIN + '/auth/whitelist/' + uuid(),
      json: true
    };
    request(opts, function (err, res, body) {
      expect(err).to.be.null();
      expect(res).to.exist();
      expect(res.statusCode).to.equal(404);
      expect(body.error).to.match(/not found/i);
      require('../../fixtures/check-whitelist')([ctx.name], done);
    });
  });
});

