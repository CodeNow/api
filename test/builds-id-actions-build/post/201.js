var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./../../fixtures/api-control');
var dock = require('./../../fixtures/dock');
var multi = require('./../../fixtures/multi-factory');
var expects = require('./../../fixtures/expects');
var createCount = require('callback-count');
var uuid = require('uuid');
var exists = require('101/exists');
var not = require('101/not');
var extend = require('extend');
var Docker = require('models/apis/docker');
var dockerMockEvents = require('./../../fixtures/docker-mock-events');
var primus = require('./../../fixtures/primus');

describe('201 POST /builds/:id/actions/build', {timeout: 500}, function() {
  var ctx = {};

  before(api.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);

  afterEach(primus.disconnect);
  afterEach(require('./../../fixtures/clean-mongo').removeEverything);
  afterEach(require('./../../fixtures/clean-ctx')(ctx));
  afterEach(require('./../../fixtures/clean-nock'));
  after(api.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);
  after(dock.stop.bind(ctx));

  beforeEach(function (done) {
    ctx.user = multi.createUser(done);
  });
  beforeEach(function (done) {
    primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
  });

  describe('for User', function () {
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: ctx.user.attrs.accounts.github.id
      };
      done();
    });

    buildTheBuildTests(ctx);
  });
  describe('for Org by member', function () {
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: 11111 // org id, requires mocks. (api-client.js)
      };              // user belongs to this org.
      // build build
      require('../../fixtures/mocks/github/user-orgs')(ctx.bodyOwner.github, 'Runnable');
      // build build -> cv build
      require('../../fixtures/mocks/github/user-orgs')(ctx.bodyOwner.github, 'Runnable');

      primus.joinOrgRoom(ctx.bodyOwner.github, done);
    });

    buildTheBuildTests(ctx);
  });
});


function buildTheBuildTests (ctx) {
  beforeEach(function (done) {
    var count = createCount(done);
    ctx.build = ctx.user.createBuild({ owner: ctx.bodyOwner }, count.inc().next);
    ctx.context = ctx.user.createContext({
      name: uuid(),
      owner: ctx.bodyOwner
    }, count.inc().next);
  });
  beforeEach(function (done) {
    var opts = {
      qs: { toBuild: ctx.build.id() },
      json: { owner: ctx.bodyOwner }
    };
    ctx.cv = ctx.context.createVersion(opts, function (err) {
      if (err) { return done(err); }
      ctx.build.fetch(done);
    });
  });
  beforeEach(function (done) {
    multi.createSourceContextVersion(function (err, cv) {
      if (err) { return done(err); }
      ctx.sourceCv = cv;
      done();
    });
  });
  beforeEach(function (done) {
    ctx.cv.copyFilesFromSource(ctx.sourceCv.attrs.infraCodeVersion, done);
  });
  beforeEach(function (done) {
    ctx.expectStarted = extend(ctx.build.json(), {
      createdBy: { github: ctx.user.attrs.accounts.github.id },
      owner: ctx.bodyOwner,
      contexts: [ ctx.context.id() ],
      contextVersions: [ ctx.cv.id() ],
      created: exists,
      started: exists,
      completed: not(exists)
    });
    ctx.expectBuilt = extend(ctx.build.json(), ctx.expectStarted, {
      completed: exists,
      duration: exists,
      failed: false,
    });
    // this can be removed once build route calls cv build route
    ctx.expectVersion = extend(ctx.cv.json(), {
      'owner': ctx.bodyOwner,
      'createdBy': { github: ctx.user.attrs.accounts.github.id },
      'created': exists,
      'context': ctx.context.id(),
      'dockerHost': exists,
      'containerId': exists,
      'build.started': exists,
      'build.completed': exists,
      'build.duration': exists,
      'build.dockerImage': exists,
      'build.dockerTag': exists,
      'build.log': exists,
      'build.triggeredBy': ctx.bodyOwner
    });
    done();
  });
  beforeEach(function (done) {
    ctx.body = {
      triggeredAction: {
        manual: true
      },
      message: uuid()
    };
    ctx.expectVersion['build.message'] = ctx.body.message;
    ctx.expectVersion['build.triggeredAction'] = ctx.body.triggeredAction;
    done();
  });

  commonTests(ctx);

  describe('build with app code versions', function () {
    beforeEach(require('../../fixtures/key-factory'));
    beforeEach(function (done) {
      var repoOwnername = ctx.bodyOwner.id === ctx.user.attrs.accounts.github.id ?
        ctx.user.attrs.accounts.github.login :
        'runnable'; // orgname
      var repo = repoOwnername+'/api';
      ctx.acv = ctx.cv.addGithubRepo({
        repo:   repo,
        commit: '0000000000000000000000000000000000000000',
        branch: 'branch'
      }, done);
    });

    withAcvTests(ctx);

    // this will overlab with github hook tests
    describe('triggered by github hook', function() {
      beforeEach(function (done) {
        ctx.body = {
          triggeredAction: {
            appCodeVersion: {
              repo:   ctx.acv.attrs.repo,
              commit: '0000000000000000000000000000000000000000'
            }
          },
          message: uuid()
        };
        ctx.expectVersion['build.message'] = ctx.body.message;
        ctx.expectVersion['build.triggeredAction'] = ctx.body.triggeredAction;
        done();
      });

      withAcvTests(ctx);
    });

    function withAcvTests (ctx) {
      commonTests(ctx);

      describe('when a duplicate exists (github build duplicate)', function () {
        it('should start building the build', function (done) {
          ctx.build.build(ctx.body, expects.success(201, ctx.expected, done));
        });
      });
    }
  });
}

function commonTests (ctx) {
  itShouldBuildTheBuild(ctx);

  describe('when a duplicate exists (manual build duplicate)', function () {
    itShouldBuildTheBuild(ctx);
    /// edited infra code tests should verify cache bust
    describe('with edited infra code', function() {
      beforeEach(function (done) {
        ctx.cv.rootDir.contents.fetch(function (err) {
          if (err) { return done(err); }
          ctx.dockerfile = ctx.cv.rootDir.contents.models[0];
          done();
        });
      });

      describe('edit Dockerfile', function() {
        beforeEach(function (done) {
          ctx.dockerfile.update({ json: { body: 'FROM mongodb' } }, done);
        });

        itShouldBuildTheBuild(ctx);
      });
      describe('create new file', function() {
        beforeEach(function (done) {
          var json = {
            name: 'hey.txt',
            path: '/',
            body: 'hello'
          };
          ctx.cv.rootDir.contents.create({ json: json }, done);
        });

        itShouldBuildTheBuild(ctx);
      });
      // TODO this expectBuilt should be a failure
      // describe('delete Dockerfile', function() {
      //   beforeEach(function (done) {
      //     ctx.expectBuilt = extend(ctx.build.json(), ctx.expectStarted, {
      //       completed: exists,
      //       duration: exists,
      //       failed: true
      //     });
      //     // this can be removed once build route calls cv build route
      //     ctx.expectVersion = extend(ctx.cv.json(), {
      //       'owner': ctx.bodyOwner,
      //       'createdBy': ctx.bodyOwner,
      //       'created': exists,
      //       'context': ctx.context.id(),
      //       'dockerHost': exists,
      //       'containerId': exists,
      //       'build.message': ctx.body.message,
      //       'build.started': exists,
      //       'build.completed': exists,
      //       'build.duration': exists,
      //       'build.log': exists,
      //       'build.triggeredBy': ctx.bodyOwner
      //       // error?
      //     });
      //     ctx.dockerfile.destroy(done);
      //   });

      //   itShouldBuildTheBuild(ctx);
      // });
    });
  });
}

function itShouldBuildTheBuild (ctx) {
  it('should start building the build', function (done) {
    ctx.build.build(ctx.body,
      expects.success(201, ctx.expectStarted, function (err) {
        if (err) { return done(err); }

        dockerMockEvents.emitBuildComplete(ctx.cv);

        primus.onceVersionComplete(ctx.cv.id(), function() {
          var count = createCount(done);
          ctx.build.fetch(expects.success(200, ctx.expectBuilt, count.inc().next));
          count.inc();
          ctx.cv.fetch(expects.success(200, function (err, cv) {
            if (err) { return done(err); }
            var docker = new Docker(cv.dockerHost);
            docker.docker.getContainer(cv.containerId).inspect(function (err, data) {
              if (err) { return done(err); }
              var expectedBindsAndVolumesLength = 0;
              var expectedBindsValues = [];
              var expectedVolumesKeys = [];
              if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
                expectedBindsAndVolumesLength++;
                expectedBindsValues.push(new RegExp(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw'));
                expectedVolumesKeys.push('/cache');
              }
              if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
                expectedBindsAndVolumesLength++;
                expectedBindsValues.push(new RegExp(process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw'));
                expectedVolumesKeys.push('/layer-cache');
              }
              expect(data.Binds).to.have.length(expectedBindsAndVolumesLength);
              expectedBindsValues.forEach(function (r, i) {
                expect(data.Binds[i]).to.match(r);
              });
              expect(Object.keys(data.Volumes)).to.have.length(expectedBindsAndVolumesLength);
              expectedVolumesKeys.forEach(function (k) {
                expect(data.Volumes[k]).to.eql({});
              });
              count.next(err);
            });
          }));
        });
      }));
  });
}
