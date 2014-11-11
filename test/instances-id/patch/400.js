var Lab = require('lab');
var describe = Lab.experiment;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');


describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

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
      require('../../fixtures/mocks/github/user')(ctx.user);
      done();
    });
  });

  /**
   * Patching has a couple of different jobs.  It allows the user to edit the name of the instance,
   * modify it's public/private flag, and now, change it's build.  These tests should not only
   * verify the user can change all of these individually, they should also test everything can
   * be modified all at once
   */
  describe('PATCH', function () {
    describe('Orgs', function () {
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
    });

    // NOTE:
    // there is no way to generate strings that don't match regexp
    // that is why we need to provide manually test strings that should fail
    var def = {
      action: 'update env',
      // requiredParams: [
      // {
      //   name: 'build',
      //   type: 'ObjectId'
      // }],
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
      }]
      // {
      //   name: 'name',
      //   type: 'string'
      // }]
    };

    typesTests.makeTestFromDef(def, ctx, function(body, cb) {
      ctx.instance.update(body, cb);
    });


    
  });
});
