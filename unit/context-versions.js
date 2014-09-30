'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');

var Version = require('models/mongo/context-version');

describe('Versions', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewVersion() {
    return new Version({
      message: "test",
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      config: validation.VALID_OBJECT_ID,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files:[{
        Key: "test",
        ETag: "test",
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: "testing",
        dockerTag: "adsgasdfgasdf"
      },
      appCodeVersions: [{
        repo: 'bkendall/flaming-octo-nemisis._',
        lowerRepo: 'bkendall/flaming-octo-nemisis._',
        branch: 'master',
        commit: 'deadbeef'
      }]
    });
  }

  it('should be able to save a version!', function (done) {
    var version = createNewVersion();
    version.save(function (err, version) {
      if (err) { done(err); }
      else {
        expect(version).to.be.okay;
        done();
      }
    });
  });

  describe('InfaCodeVersion Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'infraCodeVersion');
  });

  describe('Docker Host Validation', function () {
    validation.urlValidationChecking(createNewVersion, 'dockerHost',
      schemaValidators.validationMessages.dockerHost);
  });

  describe('Github Created By Validation', function () {
    validation.githubUserRefValidationChecking(createNewVersion, 'createdBy.github');
    validation.requiredValidationChecking(createNewVersion, 'createdBy');
  });

  describe('Context Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'context');
    validation.requiredValidationChecking(createNewVersion, 'context');
  });

  describe('Build Validation', function () {
    describe('Message', function () {
      validation.stringLengthValidationChecking(function() {
        var newVersion = createNewVersion();
        newVersion.build.triggeredAction = {
          manual: true
        };
        newVersion.build.triggeredBy =  { github: validation.VALID_GITHUB_ID };
        return newVersion;
      }, 'build.message', 500);
    });
    describe('Docker Image', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerImage', 200);
    });
    describe('Docker Tag', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerTag', 500);
    });
    describe('Triggering Validation', function () {
      describe('Triggered Action', function () {
        it('should fail when triggeredAction is manual, but triggeredBy is null', function (done) {
          var version = createNewVersion();
          version.build.message = 'hello!';
          version.build.triggeredAction = {
            manual: true
          };
          version.save(function (err, model) {
            expect(model).to.not.be.ok;
            expect(err).to.be.ok;
            done();
          });
        });
        it('should fail when triggeredAction is rebuild, but triggeredBy is null', function (done) {
          var version = createNewVersion();
          version.build.message = 'hello!';
          version.build.triggeredAction = {
            rebuild: true
          };
          version.save(function (err, model) {
            expect(model).to.not.be.ok;
            expect(err).to.be.ok;
            done();
          });
        });
        it('should pass when triggeredAction is manual, and triggeredBy is filled', function (done) {
          var version = createNewVersion();
          version.build.message = 'hello!';
          version.build.triggeredAction = {
            rebuild: true
          };
          version.build.triggeredBy = { github: validation.VALID_GITHUB_ID };
          version.save(function (err, model) {
            expect(model).to.be.ok;
            expect(err).to.not.be.ok;
            done(err);
          });
        });
        it('should fail when triggeredAction is empty, but triggeredBy is filled', function (done) {
          var version = createNewVersion();
          version.build.message = 'hello!';
          version.build.triggeredBy = { github: validation.VALID_GITHUB_ID };
          version.save(function (err, model) {
            expect(model).to.not.be.ok;
            expect(err).to.be.ok;
            done();
          });
        });
      });
    });
  });


  describe('AppCode Validation', function () {
    describe('Repo', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.repo');
    });
    describe('Lower Repo', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.lowerRepo');
    });
    describe('Branch', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.branch');
      validation.stringLengthValidationChecking(createNewVersion, 'appCodeVersions.0.branch', 200);
    });
    describe('Commit', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.commit');
    });
  });
});
