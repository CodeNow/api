'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');
var primus = require('../../fixtures/primus');
var noop = require('101/noop');

describe('PATCH 400 - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createInstance(function (err, instance) {
        if (err) { return done(err); }
        ctx.instance = instance;
        done();
      });
    });

    var def = {
      action: 'update an instance',
      optionalParams: [
        {
          name: 'build',
          type: 'ObjectId'
        },
        {
          name: 'public',
          type: 'boolean'
        },
        {
          name: 'locked',
          type: 'boolean'
        },
        {
          name: 'env',
          type: 'array',
          itemType: 'string',
          itemRegExp: /^([A-z]+\W*)=.*$/,
          invalidValues: [
            'string1',
            '1=X',
            'a!=x'
          ]
        },
        {
          name: 'name',
          type: 'string',
          invalidValues: [
            'has!',
            'has.x2'
          ]
        }
      ]
    };

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.instance.setupChildren = noop; // setup children causes model id warning spam
      ctx.instance.update(body, cb);
    });

    // it('should not update dns and hosts', function (done) {
    //   ctx.instance.update(body, expects.error(400, function (err) {
    //     if (err) { return done(err); }
    //     expect(instance.attrs.containers[0]).to.exist();
    //     var count = createCount(done);
    //     expects.updatedHipacheHosts(
    //       ctx.user, instance, count.inc().next);
    //     var container = instance.containers.models[0];
    //     expects.updatedWeaveHost(
    //       container, instance.attrs.network.hostIp, count.inc().next);
    //   }));
    // });
  });
});
