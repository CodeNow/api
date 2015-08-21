'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
// var after = lab.after;
var afterEach = lab.afterEach;
var expect = require('code').expect;
var sinon = require('sinon');
var async = require('async');

var DebugContainer = require('models/mongo/debug-container');
var Docker = require('models/apis/docker');
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');

var ctx = {};
describe('Debug Containers', function () {
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

  beforeEach(function (done) {
    var c = new Context({
      owner: { github: 1 },
      name: 'Foo',
      lowerName: 'foo'
    });
    var cv = new ContextVersion({
      context: c._id,
      createdBy: { github: 1 },
      dockerHost: 'http://example.com:4242'
    });
    ctx.dc = new DebugContainer({
      contextVersion: cv._id,
      layerId: 'deadbeef',
      owner: { github: 1 },
      instance: c._id
    });
    async.series([
      c.save.bind(c),
      cv.save.bind(cv),
      ctx.dc.save.bind(ctx.dc),
      ctx.dc.populate.bind(ctx.dc, 'contextVersion')
    ], done);
  });

  describe('deploy', function () {
    it('should create, start, and inspect a container', function (done) {
      var containerStart = sinon.stub().yieldsAsync(null);
      var containerInspect = sinon.stub().yieldsAsync(null, { Id: 4 });
      var container = {
        start: containerStart,
        inspect: containerInspect
      };
      sinon.stub(Docker.prototype, 'createContainer').yieldsAsync(null, container);

      ctx.dc.deploy(function (err, dc) {
        if (err) { return done(err); }
        expect(Docker.prototype.createContainer.calledOnce).to.be.true();
        expect(containerStart.calledOnce).to.be.true();
        expect(containerInspect.calledOnce).to.be.true();
        expect(dc.id).to.equal(ctx.dc.id);
        done();
      });
    });
  });
});
