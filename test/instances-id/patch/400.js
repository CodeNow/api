var Lab = require('lab');
var describe = Lab.experiment;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');


describe('PATCH 400 - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, mdlArray, srcArray) {
      //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.cv = mdlArray[0];
      ctx.context = mdlArray[1];
      ctx.srcArray = srcArray;
      done();
    });
  });

  describe('invalid types', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001;
      multi.createInstance(ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
        //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) {
          return done(err);
        }
        ctx.instance = instance;
        ctx.build = build;
        ctx.user = user;
        ctx.cv = mdlArray[0];
        ctx.context = mdlArray[1];
        ctx.srcArray = srcArray;

        multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
          if (err) {
            done(err);
          }
          ctx.otherBuild = build;
          done();
        });
      });
    });

    var def = {
      action: 'update',
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
          name: 'env',
          type: 'array',
          itemType: 'string',
          itemRegExp: /^([A-Za-z]+[A-Za-z0-9_]*)=('(\n[^']*')|("[^"]*")|([^\s#]+))$/,
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

    typesTests.makeTestFromDef(def, ctx, function(body, cb) {
      ctx.instance.update(body, cb);
    });


  });
});