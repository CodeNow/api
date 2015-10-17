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

var rabbitMQ = require('../../../lib/models/rabbitmq');
var api = require('../fixtures/api-control');

var request = require('request');

var sinon = require('sinon');

var ctx = {};
describe('GET /actions/internal/deprovision-clusters', function () {
  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));

  beforeEach(function (done) {
    sinon.stub(rabbitMQ, 'publishClusterDeprovision');
    done();
  });

  afterEach(function (done) {
    rabbitMQ.publishClusterDeprovision.restore();
    done();
  });

  beforeEach(function (done) {

    ctx.j = request.jar();
    require('../fixtures/multi-factory').createUser({
      requestDefaults: { jar: ctx.j }
    }, function (err, user) {
      ctx.user = user;
      done(err);
    });
  });

  it('should return 204 and create jobs for each userId', function (done) {
    var opts = {
      method: 'POST',
      url: process.env.FULL_API_DOMAIN + '/actions/internal/deprovision-clusters',
      json: true,
      jar: ctx.j
    };
    request(opts, function (err, res, body) {
      expect(err).to.be.null();
      expect(res).to.exist();
      expect(res.statusCode).to.equal(204);
      expect(body).to.be.undefined();
      var userIds = process.env.TEST_GITHUB_USER_IDS.split(',').map(function (id) {
        return id.trim();
      });
      expect(rabbitMQ.publishClusterDeprovision.callCount).to.equal(userIds.length);
      expect(rabbitMQ.publishClusterDeprovision.getCall(0).args[0].githubId).to.equal(userIds[0]);
      expect(rabbitMQ.publishClusterDeprovision.getCall(userIds.length - 1).args[0].githubId)
        .to.equal(userIds[userIds.length - 1]);
      done();
    });
  });
});
