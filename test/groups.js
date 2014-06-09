var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var users = require('./fixtures/user-factory');

describe('Groups - /groups', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    ctx.user = users.createRegistered(done);
  });

  describe('POST', function () {
    it('should create a group', function (done) {
      ctx.user.createGroup({ json: {
        name: 'my first group',
        username: 'group1'
      }}, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.be.ok;
        expect(body._id).to.be.ok;
        expect(body.username).to.equal('group1');
        expect(body.name).to.equal('my first group');
        expect(body.isGroup).to.equal(true);
        done();
      });
    });
  });
});
