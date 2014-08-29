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
      environment: validation.VALID_OBJECT_ID,
      project: validation.VALID_OBJECT_ID,
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
        repo: 'bkendall/flaming-octo-nemisis',
        lowerRepo: 'bkendall/flaming-octo-nemisis',
        branch: 'master',
        lockCommit: false
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

  describe('Github Owner Id Validation', function () {
    validation.githubUserRefValidationChecking(createNewVersion, 'createdBy.github');
    validation.requiredValidationChecking(createNewVersion, 'createdBy');
  });

  describe('Context Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'context');
    validation.requiredValidationChecking(createNewVersion, 'context');
  });

  describe('Environment Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'environment');
    validation.requiredValidationChecking(createNewVersion, 'environment');
  });

  describe('Project Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'project');
    validation.requiredValidationChecking(createNewVersion, 'project');
  });

  describe('Build Validation', function () {
    describe('Message', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.message', 500);
    });
    describe('Docker Image', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerImage', 200);
    });
    describe('Docker Tag', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerTag', 500);
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
      validation.stringLengthValidationChecking(createNewVersion, 'appCodeVersions.0.branch', 200);
    });
    describe('Lock Commit', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.lockCommit');
    });
  });
});
