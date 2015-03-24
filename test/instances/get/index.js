var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var createCount = require('callback-count');

describe('GET /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('GET', function() {
    beforeEach(function (done) {
      multi.createInstance(function (err, instance, build, user) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build; // builtBuild
        ctx.user = user;
        multi.createInstance(function (err, instance, build, user) {
          if (err) { return done(err); }
          ctx.instance2 = instance;
          ctx.build2 = build;
          ctx.user2 = user;
          done();
        });
      });
    });
    it('should get instances by hashIds', function (done) {
      var count = createCount(2, done);
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user2);
      var query = {
        shortHash: ctx.instance.json().shortHash,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      };
      var expected = [{
        _id: ctx.instance.json()._id,
        shortHash: ctx.instance.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user.json().accounts.github.id,
        'owner.username': ctx.user.json().accounts.github.login,
        'createdBy.username': ctx.user.json().accounts.github.login,
        'createdBy.gravatar': ctx.user.json().accounts.github.avatar_url
      }];
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        shortHash: ctx.instance2.json().shortHash,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user2.json().accounts.github.id,
        'owner.username': ctx.user2.json().accounts.github.login,
        'createdBy.username': ctx.user2.json().accounts.github.login,
        'createdBy.gravatar': ctx.user2.json().accounts.github.avatar_url
      }];
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    it('should get instances by username', {timeout:500}, function (done) {
      var count = createCount(2, done);
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user2);
      var query = {
        githubUsername: ctx.user.json().accounts.github.username
      };
      var expected = [
        {
          _id: ctx.instance.json()._id,
          shortHash: ctx.instance.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('../../fixtures/mocks/github/users-username')
        (ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.username);
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        githubUsername: ctx.user2.json().accounts.github.username
      };
      var expected2 = [
        {
          _id: ctx.instance2.json()._id,
          shortHash: ctx.instance2.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('../../fixtures/mocks/github/users-username')
        (ctx.user2.json().accounts.github.id, ctx.user2.json().accounts.github.username);
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    it('should get instances by ["contextVersion.appCodeVersions.repo"]', {timeout:500}, function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user);
      var count = createCount(2, done);
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user2);
      var query = {
        'contextVersion.appCodeVersions.repo': ctx.instance.attrs.contextVersion.appCodeVersions[0].repo,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      };
      var expected = [
        {
          _id: ctx.instance.json()._id,
          shortHash: ctx.instance.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('../../fixtures/mocks/github/users-username')
        (ctx.user.json().accounts.github.id, ctx.user.attrs.accounts.github.username);
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        'contextVersion.appCodeVersions.repo': ctx.instance2.attrs.contextVersion.appCodeVersions[0].repo,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [
        {
          _id: ctx.instance2.json()._id,
          shortHash: ctx.instance2.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('../../fixtures/mocks/github/users-username')
        (ctx.user2.json().accounts.github.id, ctx.user2.attrs.accounts.github.username);
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    it('should list instances by owner.github', function (done) {
      var count = createCount(2, done);
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user2);

      var query = {
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      };
      var expected = [
        {}
      ];
      expected[0]['build._id'] = ctx.build.id();
      expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
      expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
      expected[0]['containers[0].inspect.State.Running'] = true;
      // FIXME: chai is messing up with eql check:
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));

      var query2 = {
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [{}];
      expected2[0]['build._id'] = ctx.build2.id();
      expected2[0]['owner.username'] = ctx.user2.json().accounts.github.username;
      expected2[0]['owner.github'] = ctx.user2.json().accounts.github.id;
      expected[0]['containers[0].inspect.State.Running'] = true;
      // FIXME: chai is messing up with eql check:
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });

    it('should get instance by container.dockerContainer', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user);

      var dockerContainer = ctx.instance.attrs.container.dockerContainer;
      var query = {
        owner: {
          github: ctx.user.attrs.accounts.github.id
        },
        'container.dockerContainer': dockerContainer
      };

      ctx.user.fetchInstances(query, expects.success(200, function(err, body) {
        if (err) { return done(err); }
        expect(body.length).to.equal(1);
        expect(body[0].container.dockerContainer).to.equal(dockerContainer);
        done();
      }));
    });
    describe('update name to be short (so url length is not exceeded)', function() {
      // bc subdomains can only be 63 chars
      beforeEach(function (done) {
        ctx.instance.update({name:'1'}, done);
      });
      it('should get instance by url and name', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user);
        require('../../fixtures/mocks/github/users-username')(
          ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login);
        var url = [
          'http://',
          ctx.instance.attrs.name, '-', ctx.user.attrs.accounts.github.username, '.',
          process.env.USER_CONTENT_DOMAIN
        ].join('');
        var query = {
          url: url,
          name: ctx.instance.attrs.name
        };
        ctx.user.fetchInstances(query, expects.success(200, function(err, body) {
          if (err) { return done(err); }
          expect(body.length).to.equal(1);
          expect(body[0].shortHash).to.equal(ctx.instance.id());
          done();
        }));
      });
    });

    it('should return an empty set given an invalid container.dockerContainer', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user);

      var query = {
        owner: {
          github: ctx.user.attrs.accounts.github.id
        },
        'container.dockerContainer': 'invalid'
      };

      ctx.user.fetchInstances(query, expects.success(200, function(err, body) {
        if (err) { return done(err); }
        expect(body.length).to.equal(0);
        done();
      }));
    });

    describe('name and owner', function () {
      beforeEach(function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user);
        require('../../fixtures/mocks/github/user')(ctx.user);
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update({ name: 'InstanceNumber1' }, function (err) {
          if (err) { return done(err); }
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/user')(ctx.user);
          ctx.instance3 = ctx.user.createInstance({
            name: 'InstanceNumber3',
            build: ctx.instance.attrs.build._id
          }, done);
        });
      });
      it('should list instances by owner.github and name', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user);
        require('../../fixtures/mocks/github/user')(ctx.user2);
        var query = {
          owner: {
            github: ctx.user.attrs.accounts.github.id
          },
          name: 'InstanceNumber3'
        };
        var expected = [
          {}
        ];
        expected[0]['build._id'] = ctx.build.id(); // instance3's build
        expected[0].name = 'InstanceNumber3';
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
        expected[0]['containers[0].inspect.State.Running'] = true;
        // FIXME: chai is messing up with eql check:
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
      it('should list instances by githubUsername and name', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user);

        var query = {
          githubUsername: ctx.user.json().accounts.github.username,
          name: 'InstanceNumber3'
        };
        var expected = [
          {}
        ];
        expected[0]['build._id'] = ctx.build.id(); // instance3's build
        expected[0].name = 'InstanceNumber3';
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
        expected[0]['containers[0].inspect.State.Running'] = true;
        // FIXME: chai is messing up with eql check:
        require('../../fixtures/mocks/github/users-username')(ctx.user.attrs.accounts.github.id,
          ctx.user.json().accounts.github.username);
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
    });

    describe('exceptions', function () {
      it('should list projects belonging to HelloRunnable for any unautheticated '+
         'or authenticated request from any user', function (done) {
        var query = {
          owner: {
            github: process.env.HELLO_RUNNABLE_GITHUB_ID
          }
        };
        var expected = [];
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
    });

    describe('errors', function () {
      it('should not list projects for owner.github the user does not have permission for', function (done) {
        var query = {
          owner: {
            github: ctx.user2.attrs.accounts.github.id
          }
        };
        require('../../fixtures/mocks/github/user-orgs')();
        ctx.user.fetchInstances(query, expects.error(403, /denied/, function (err) {
          if (err) { return done(err); }
          var query2 = {
            owner: {
              github: ctx.user.attrs.accounts.github.id
            }
          };
          require('../../fixtures/mocks/github/user-orgs')();
          ctx.user2.fetchInstances(query2, expects.error(403, /denied/, done));
        }));
      });
      it('should error when the username is not found', function (done) {
        var query = {
          githubUsername: ctx.user.json().accounts.github.username
        };
        // Make username fetch 404
        require('../../fixtures/mocks/github/users-username')(null, null, null, true);
        ctx.user.fetchInstances(query, expects.error(404, /Not found/, done));
      });
      it('should require owner.github', function (done) {
        var query = {};
        ctx.user.fetchInstances(query, expects.error(400, /owner[.]github/, done));
      });
      it('should require owner (with name)', function (done) {
        var query = { name: 'hello' };
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done));
      });
      it('should require owner (with shorthash)', function (done) {
        var query = { shortHash: 'hello' };
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done));
      });
    });
  });


  describe('Org Get', function () {
    beforeEach(function (done) {
      var orgInfo = require('../../fixtures/mocks/github/user-orgs')();
      ctx.orgId = orgInfo.orgId;
      ctx.orgName = orgInfo.orgName;
      multi.createInstance(ctx.orgId, ctx.orgName, function (err, instance, build, user) {
        ctx.user = user;
        ctx.instance = instance;
        done(err);
      });
    });
    describe('name and owner', function () {
      it('should list instances by githubUsername and name', function (done) {
        var query = {
          githubUsername: ctx.orgName,
          name: ctx.instance.attrs.name
        };
        var expected = [
          {}
        ];
        expected[0].name = ctx.instance.attrs.name;
        // expected[0]['owner.username'] = ctx.orgName;
        expected[0]['owner.github'] = ctx.orgId;
        require('../../fixtures/mocks/github/users-username')(ctx.orgId, ctx.orgName);
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
    });
  });
});
