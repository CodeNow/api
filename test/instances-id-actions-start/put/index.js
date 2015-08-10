/**
 * @module test/instances-id-actions-start/put/index
 */
'use strict';

var Lab = require('lab');
var Code = require('code');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var createCount = require('callback-count');

var Instance = require('models/mongo/instance');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');

describe('PUT /instances/:id/actions/start', function () {
  var ctx = {};

  beforeEach(api.start.bind(ctx));
  beforeEach(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(api.stop.bind(ctx));
  afterEach(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  beforeEach(function (done) {
    multi.createBuiltBuild(function (err, build, user, modelsArr) {
      if (err) { return done(err); }
      ctx.build = build;
      ctx.user = user;
      ctx.cv = modelsArr[0];
      done();
    });
  });

  beforeEach(function (done) {
    primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
  });

  beforeEach(function (done) {
    multi.createAndTailInstance(primus, function (err, instance) {
      ctx.instance = instance;
      done();
    });
  });

  it('should error if instance not found', function (done) {
    Instance.findOneAndRemove({
      '_id': ctx.instance.attrs._id
    }, {}, function (err) {
      if (err) { throw err; }
      ctx.instance.start(function (err) {
        expect(err.data.message).to.equal('Instance not found');
        expect(err.data.statusCode).to.equal(404);
        done();
      });
    });
  });

  it('should error if instance does not have a container', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$unset': {
        container: 1
      }
    }, function (err) {
      if (err) { throw err; }
      ctx.instance.start(function (err) {
        expect(err.message).to.equal('Instance does not have a container');
        expect(err.output.statusCode).to.equal(400);
        done();
      });
    });
  });

  it('should return error if container is already starting', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$set': {
        'container.inspect.State.Starting': true
      }
    }, function (err) {
      if (err) { throw err; }
      ctx.instance.start(function (err) {
        expect(err.message).to.equal('instance is already starting');
        expect(err.output.statusCode).to.equal(400);
        done();
      });
    });
  });

  it('should error if user it not owner of instance', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$set': {
        'owner.github': '9999' // something else
      }
    }, function (err) {
      if (err) { throw err; }
      ctx.instance.start(function (err) {
        expect(err.message).to.equal('Access denied (!owner)');
        expect(err.output.statusCode).to.equal(403);
        done();
      });
    });
  });

  it('should start a container and remove the starting property', function (done) {
    var count = createCount(done, 3);
    primus.expectAction('stopping', function (err, data) {
      expect(data.data.data.container.inspect.State.Stopping).to.equal(true);
      expect(data.data.data.container.inspect.State.Starting).to.be.undefined();
      count.next();
    });
    primus.expectAction('stop', function (err, data) {
      expect(data.data.data.container.inspect.State.Stopping).to.be.undefined();
      expect(data.data.data.container.inspect.State.Starting).to.be.undefined();
      count.next();
    });
    ctx.instance.stop(function () {
      count.next();
    });
  });

/*
  it('should succeed if user is !owner and is a moderator', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$set': {
        'owner.github': '9999' // something else
      }
    }, function (err) {
      if (err) { throw err; }
      User.findOneAndUpdate({
        '_id': ctx.user.attrs._id
      }, {
        '$set': {
          permissionLevel: 1
        }
      }, function (err) {
        if (err) { throw err; }
        ctx.instance.start(function (err) {
          expect(err.message).to.equal('Access denied (!owner)');
          expect(err.output.statusCode).to.equal(403);
          done();
        });
      });
    });
  });

  it('should set a starting property and emit a starting event', function (done) {
    done();
  });

  it('should remove the starting property if docker container start fails', function (done) {
  });
*/

});
