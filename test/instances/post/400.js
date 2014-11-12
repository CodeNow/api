var Lab = require('lab');
var describe = Lab.experiment;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');
var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');


describe('400 POST /instances', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);


  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.build = build;
        ctx.user = user;
        ctx.cv = contextVersion;
        // mocks for build
        ctx.build.build({ message: uuid() }, expects.success(201, done));
      });
    });

    afterEach(function (done) {
      var instance = ctx.instance;
      multi.tailInstance(ctx.user, instance, function (err) {
        if (err) { return done(err); }
        expect(instance.attrs.containers[0]).to.be.okay;
        var count = createCount(done);
        expects.updatedHipacheHosts(
          ctx.user, instance, count.inc().next);
        var container = instance.containers.models[0];
        expects.updatedWeaveHost(
          container, instance.attrs.network.hostIp, count.inc().next);
      });
    });
    var def = {
      action: 'create an instance',
      requiredParams: [
        {
          name: 'build',
          type: 'ObjectId'
        }
      ],
      // TODO (anton) ask about parent parameter
      optionalParams: [
        {
          name: 'env',
          type: 'array',
          itemType: 'string',
          itemRegExp: /^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/,
          itemValues: [
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
        }, 
        {
          name: 'owner',
          type: 'object',
          keys: [
            {
              name: 'github',
              type: 'number'
            }
          ]
        }
      ]
    };

    typesTests.makeTestFromDef(def, ctx, function(body, cb) {
      ctx.user.createInstance(body, cb);
    });
  });
});

