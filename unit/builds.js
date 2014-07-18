var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');

var Build = require('models/mongo/build');

describe('Build', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewBuild() {
    return new Build({
      environment: validation.VALID_OBJECT_ID,
      contexts: [validation.VALID_OBJECT_ID],
      contextVersions: [validation.VALID_OBJECT_ID],
      created: Date.now(),
      createdBy: { github: validation.VALID_GITHUB_ID }
    });
  }

  it('should be able to save a build!', function (done) {
    var build = createNewBuild();
    build.save(function (err, build) {
      if (err) { done(err); }
      else {
        expect(build).to.be.okay;
        done();
      }
    });
  });

  describe('CreatedBy Validation', function () {
    validation.githubUserRefValidationChecking(createNewBuild, 'createdBy.github');
    validation.requiredValidationChecking(createNewBuild, 'createdBy');
  });

  describe('Environment Id Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'environment');
    validation.requiredValidationChecking(createNewBuild, 'environment');
  });

  describe('Context Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contexts', true);
    validation.requiredValidationChecking(createNewBuild, 'contexts');
  });

  describe('Version Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contextVersions', true);
    validation.requiredValidationChecking(createNewBuild, 'contextVersions');
  });

  describe('Testing SetInProgress', function () {
    var ctx = {};
    beforeEach(function(done) {
      ctx.build = createNewBuild();
      ctx.build.save(function(err, build) {
        ctx.build.setInProgress(function(err, newbuild) {
          if (err) {
            done(err);
          } else {
            ctx.build = newbuild;
            done();
          }
        });
      });
    });
    afterEach(function(done) {
      delete ctx.build;
      done();
    });
    it('should be able to set the build in progress', function (done) {
      expect(ctx.build).to.be.okay;
      done();
    });
    it('should create another build, and the buildNumber should be higher ', function (done) {
      ctx.build2 = createNewBuild();
      ctx.build2.save(function(err, build) {
        build.setInProgress(function(err, newbuild) {
          if (err) {
            done(err);
          } else {
            expect(newbuild).to.be.okay;
            expect(ctx.build.buildNumber).to.be.below(newbuild.buildNumber);
            done();
          }
        });
      });
    });
  });
});
