var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var InfraCodeVersion = require('models/mongo/infra-code-version');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var expects = require('../../fixtures/expects');
var exists = require('101/exists');
var equals = require('101/equals');
var not = require('101/not');

describe('POST /instances/:id/actions/copy', { timeout: 500 }, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, modelsArr) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.context = modelsArr[1];
      ctx.contextVersion = modelsArr[0];
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user);
      done();
    });
  });

  /**
   * This tests the copy instance route.  Since this route uses the existing copyBuild and create
   * instance routes, we don't have to test too much of their logic.  Basic copying logic should
   * be tested here
   */
  describe('Copy', function () {
    describe('owner', function () {
      it('should copy the instance, and give it the same build', function (done) {
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          owner: { github: ctx.user.json().accounts.github.id,
                   username: ctx.user.json().accounts.github.username },
          parent: ctx.instance.id(),
          'build._id': ctx.build.id(),
          containers: exists
        };
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.instance.copy(expects.success(201, expected, done));
      });
      it('should copy the instance, and give it the same build, with a new name!', function (done) {
        var expected = {
          shortHash: exists,
          name: 'new-name-fo-shizzle',
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          'owner.github': ctx.user.json().accounts.github.id,
          'owner.username': ctx.user.json().accounts.github.username,
          parent: ctx.instance.id(),
          'build._id': ctx.build.id(),
          containers: exists
        };
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.instance.copy({ json: {
          name: 'new-name-fo-shizzle'
        }}, expects.success(201, expected, done));
      });
      describe('parent has env', function () {
        beforeEach(function (done) {
          ctx.instance.update({ env: ['ONE=1'] }, expects.success(200, done));
        });
        it('should copy the instance env vars if it has them', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id },
            owner: { github: ctx.user.json().accounts.github.id,
                     username: ctx.user.json().accounts.github.username },
            parent: ctx.instance.id(),
            'build._id': ctx.build.id(),
            containers: exists,
            env: ['ONE=1']
          };
          require('../../fixtures/mocks/github/user')(ctx.user);
          ctx.instance.copy(expects.success(201, expected, done));
        });
        it('should accept new envs if they are sent with the copy', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id },
            owner: { github: ctx.user.json().accounts.github.id,
                     username: ctx.user.json().accounts.github.username },
            parent: ctx.instance.id(),
            'build._id': ctx.build.id(),
            containers: exists,
            env: ['TWO=2']
          };
          require('../../fixtures/mocks/github/user')(ctx.user);
          var body = {
            env: expected.env
          };
          ctx.instance.copy(body, expects.success(201, expected, done));
        });
      });
    });

    describe('group', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001;
        multi.createInstance(ctx.orgId, function (err, instance, build) {
          if (err) { return done(err); }
          ctx.instance = instance;
          ctx.build = build;
          done();
        });
      });
      it('should copy the instance when part of org', function (done) {
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          'owner.github': ctx.orgId,
          parent: ctx.instance.id(),
          'build._id': ctx.build.id(),
          containers: exists
        };
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        ctx.user.copyInstance(ctx.instance.id(), expects.success(201, expected, done));
      });
      describe('Same org, different user', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.nonOwner = multi.createUser(done);
        });
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.otherInstance = ctx.user.copyInstance(ctx.instance.id(), done);
        });
        it('should copy the instance when part of the same org as the owner', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.nonOwner.json().accounts.github.id },
            'owner.github': ctx.orgId,
            parent: ctx.otherInstance.id(),
            'build._id': ctx.build.id(),
            containers: exists
          };
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.nonOwner.copyInstance(ctx.otherInstance.id(), expects.success(201, expected, done));
        });
      });
    });
    describe('non-owner', function () {
      beforeEach(function (done) {
        require('../../fixtures/mocks/github/user-orgs')(100, 'otherOrg');
        ctx.nonOwner = multi.createUser(done);
      });
      it('should not copy a private instance', function (done) {
        var instance = ctx.nonOwner.newInstance(ctx.instance.id());
        instance.copy(expects.errorStatus(403, done));
      });
      describe('public instance', function () {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: true } }, done);
        });
        beforeEach(function (done) {
          ctx.context.update({json: {public: true}}, done);
        });
        it('should copy a public instance', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: {github: ctx.nonOwner.json().accounts.github.id},
            owner: {
              github: ctx.nonOwner.json().accounts.github.id,
              username: ctx.nonOwner.json().accounts.github.username
            },
            parent: ctx.instance.id(),
            'build._id': not(equals(ctx.build.id())),
            containers: exists
          };
          require('../../fixtures/mocks/github/user')(ctx.nonOwner);
          require('../../fixtures/mocks/github/user')(ctx.nonOwner);
          require('../../fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          var instance = ctx.nonOwner.newInstance(ctx.instance.id());
          var newInstance = instance.copy(expects.success(201, expected, function () {
            expect(newInstance.build.attrs.contexts[0]).to.not.equal(ctx.context.id());
            expect(newInstance.build.attrs.contextVersions[0]).to.not.equal(ctx.contextVersion.id());
            expect(newInstance.attrs.contextVersion.context).to.not.equal(ctx.context.id());
            console.log(newInstance.attrs.contextVersion.infraCodeVersion);
            InfraCodeVersion.findById(newInstance.attrs.contextVersion.infraCodeVersion, function (a, b, c) {
              console.log(a, b, c);
              done();
            });
          }));
        });
      });
    });
  });
});
